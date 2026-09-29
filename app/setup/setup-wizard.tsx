"use client";

import {useRouter} from "next/navigation";
import {useEffect, useRef, useState, type FormEvent, type ReactNode} from "react";
import {
    createSetupAdminAction,
    confirmSetupCodeAction,
    finishSetupAction,
    setupCameraAction,
    setupClimateAction,
    setupTimelapseAction,
    setupTwitchAction,
    skipInstallerStepAction,
} from "@/app/setup/actions";
import {ControllerList} from "@/app/setup/controller-list";
import {INSTALLER_COPY, installerDoneRows} from "@/app/setup/installer-copy";
import {InstallerRail} from "@/app/setup/installer-rail";
import {PasswordLine} from "@/app/setup/password-line";
import {SetupCodeInput} from "@/app/setup/setup-code-input";
import {passwordLineMet} from "./password-meter";
import {normalizeUsernameInput, validateUsernameInput} from "@/lib/admin-username";
import {SETUP_CODE_LENGTH} from "@/lib/setup-code";
import type {InstallerInitial, InstallerOptionalStep, InstallerStepId} from "@/lib/installer-steps";
import type {SpiderFarmerController} from "@/lib/spider-farmer-login";

type WizardStep = InstallerStepId | "climate-list" | "done";

function prefersReducedMotion(): boolean {
    return typeof window !== "undefined"
        && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function railCurrent(step: WizardStep): InstallerStepId | "done" {
    if (step === "climate-list") return "climate";
    if (step === "done") return "done";
    return step;
}

function stepCopy(step: WizardStep): {eyebrow: string; title: string; line: string} {
    if (step === "climate-list") {
        return {
            eyebrow: INSTALLER_COPY.climate.eyebrow,
            title: INSTALLER_COPY.climate.listTitle,
            line: "",
        };
    }
    if (step === "done") {
        return INSTALLER_COPY.done;
    }
    return INSTALLER_COPY[step];
}

export function SetupWizard({initial}: {initial: InstallerInitial}) {
    const router = useRouter();
    const runGate = useRef(false);
    const goGeneration = useRef(0);
    const goTimeouts = useRef<number[]>([]);
    const goRafs = useRef<number[]>([]);

    const [step, setStep] = useState<WizardStep>(initial.step);
    const [finished, setFinished] = useState<ReadonlySet<InstallerStepId>>(() => new Set(initial.finished));
    const [skipped, setSkipped] = useState<string[]>(initial.skipped);
    const [message, setMessage] = useState("");
    const [saving, setSaving] = useState(false);
    const [busy, setBusy] = useState(false);
    const [copyClass, setCopyClass] = useState("installer-copy");

    const [setupCode, setSetupCode] = useState("");
    const [codeInvalid, setCodeInvalid] = useState(false);
    const [username, setUsername] = useState(initial.username);
    const [password, setPassword] = useState("");
    const [sfEmail, setSfEmail] = useState("");
    const [sfPassword, setSfPassword] = useState("");
    const [controllers, setControllers] = useState<SpiderFarmerController[]>([]);
    const [selectedSerial, setSelectedSerial] = useState("");
    const [streamUrl, setStreamUrl] = useState("");
    const [twitchKey, setTwitchKey] = useState("");
    const [twitchLogin, setTwitchLogin] = useState("");
    const [rtspStream, setRtspStream] = useState("");
    const [interval, setIntervalMinutes] = useState("15");
    const [timezone, setTimezone] = useState("UTC");

    const [savedUsername, setSavedUsername] = useState(initial.username);
    const [climateLabel, setClimateLabel] = useState<string | null>(initial.climate);
    const [savedStreamUrl, setSavedStreamUrl] = useState<string | null>(initial.streamUrl);
    const [twitchSaved, setTwitchSaved] = useState(initial.twitchSaved);
    const [timelapseLabel, setTimelapseLabel] = useState<string | null>(initial.timelapse);

    const copy = stepCopy(step);
    const climateLine = step === "climate-list" ? `Signed in as ${sfEmail}.` : copy.line;
    const adminReady = validateUsernameInput(normalizeUsernameInput(username))
        && passwordLineMet(password);
    const codeReady = setupCode.replace(/[^a-z0-9]/gi, "").length === SETUP_CODE_LENGTH;
    const locked = busy || saving;

    useEffect(() => {
        return () => {
            goGeneration.current += 1;
            for (const id of goTimeouts.current) window.clearTimeout(id);
            for (const id of goRafs.current) window.cancelAnimationFrame(id);
            goTimeouts.current = [];
            goRafs.current = [];
        };
    }, []);

    function clearGoTimers() {
        for (const id of goTimeouts.current) window.clearTimeout(id);
        for (const id of goRafs.current) window.cancelAnimationFrame(id);
        goTimeouts.current = [];
        goRafs.current = [];
    }

    function waitTracked(ms: number): Promise<void> {
        return new Promise((resolve) => {
            const id = window.setTimeout(resolve, ms);
            goTimeouts.current.push(id);
        });
    }

    function markFinished(id: InstallerStepId) {
        setFinished((prev) => new Set(prev).add(id));
    }

    async function go(next: WizardStep, withSaving: boolean) {
        const generation = ++goGeneration.current;
        clearGoTimers();
        const reduce = prefersReducedMotion();
        if (withSaving) {
            setSaving(true);
            if (!reduce) {
                await waitTracked(200);
                if (generation !== goGeneration.current) return;
            }
        } else {
            setSaving(false);
        }
        if (reduce) {
            if (generation !== goGeneration.current) return;
            setStep(next);
            setMessage("");
            setSaving(false);
            setCopyClass("installer-copy");
            return;
        }
        setCopyClass("installer-copy leave");
        await waitTracked(420);
        if (generation !== goGeneration.current) return;
        setStep(next);
        setMessage("");
        setSaving(false);
        setCopyClass("installer-copy enter");
        const raf = window.requestAnimationFrame(() => {
            if (generation !== goGeneration.current) return;
            setCopyClass("installer-copy enter show");
        });
        goRafs.current.push(raf);
    }

    async function runLocked(work: () => Promise<void>) {
        if (runGate.current) return;
        runGate.current = true;
        setBusy(true);
        setMessage("");
        try {
            await work();
        } finally {
            runGate.current = false;
            setBusy(false);
        }
    }

    async function skip(id: InstallerOptionalStep, next: WizardStep) {
        await runLocked(async () => {
            const result = await skipInstallerStepAction(id);
            if (!result.ok) {
                setMessage(result.message);
                return;
            }
            setSkipped((prev) => (prev.includes(id) ? prev : [...prev, id]));
            await go(next, false);
        });
    }

    async function onAuthenticate(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!codeReady) return;
        await runLocked(async () => {
            const result = await confirmSetupCodeAction(setupCode);
            if (!result.ok) {
                setCodeInvalid(true);
                return;
            }
            setCodeInvalid(false);
            markFinished("authenticate");
            await go("admin", true);
        });
    }

    async function onAdmin(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!adminReady) return;
        await runLocked(async () => {
            const formData = new FormData();
            formData.set("setupCode", setupCode);
            formData.set("username", username);
            formData.set("password", password);
            const result = await createSetupAdminAction(formData);
            if (!result.ok) {
                setMessage(result.message);
                return;
            }
            setSavedUsername(username);
            markFinished("admin");
            await go("climate", true);
        });
    }

    async function onClimate(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        await runLocked(async () => {
            const formData = new FormData();
            formData.set("sfEmail", sfEmail);
            formData.set("sfPassword", sfPassword);
            const result = await setupClimateAction(formData);
            if (result.ok) {
                setClimateLabel(result.detail ?? null);
                markFinished("climate");
                await go("camera", true);
                return;
            }
            if (result.choose?.length) {
                setControllers(result.choose);
                setSelectedSerial(result.choose[0]?.serial ?? "");
                await go("climate-list", true);
                return;
            }
            setMessage(result.message);
        });
    }

    async function onClimatePick(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!selectedSerial) return;
        await runLocked(async () => {
            const formData = new FormData();
            formData.set("sfEmail", sfEmail);
            formData.set("sfPassword", sfPassword);
            formData.set("sfSerial", selectedSerial);
            const result = await setupClimateAction(formData);
            if (!result.ok) {
                setMessage(result.message);
                return;
            }
            const chosen = controllers.find((controller) => controller.serial === selectedSerial);
            setClimateLabel(result.detail ?? chosen?.name ?? null);
            markFinished("climate");
            await go("camera", true);
        });
    }

    async function onCamera(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        await runLocked(async () => {
            const formData = new FormData();
            formData.set("streamUrl", streamUrl);
            const result = await setupCameraAction(formData);
            if (!result.ok) {
                setMessage(result.message);
                return;
            }
            setSavedStreamUrl(streamUrl.trim());
            markFinished("camera");
            await go("twitch", true);
        });
    }

    async function onTwitch(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        await runLocked(async () => {
            const formData = new FormData();
            formData.set("twitchKey", twitchKey);
            formData.set("twitchLogin", twitchLogin);
            const result = await setupTwitchAction(formData);
            if (!result.ok) {
                setMessage(result.message);
                return;
            }
            setTwitchSaved(true);
            markFinished("twitch");
            await go("timelapse", true);
        });
    }

    async function onTimelapse(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        await runLocked(async () => {
            const formData = new FormData();
            formData.set("rtspStream", rtspStream);
            formData.set("interval", interval);
            formData.set("timezone", timezone);
            const result = await setupTimelapseAction(formData);
            if (!result.ok) {
                setMessage(result.message);
                return;
            }
            setTimelapseLabel(`Camera address, ${interval} min, ${timezone}`);
            markFinished("timelapse");
            await go("done", true);
        });
    }

    async function onFinish() {
        await runLocked(async () => {
            const result = await finishSetupAction();
            if (!result.ok) {
                setMessage(result.message);
                return;
            }
            router.push("/");
        });
    }

    const saveClass = saving ? "installer-save saving" : "installer-save";
    const saveLabel = saving ? "Saving" : undefined;

    return (
        <main
            style={{
                minHeight: "100vh",
                display: "grid",
                gridTemplateColumns: "240px minmax(0, 1fr)",
                background: "#1f1f1f",
                color: "#f3f4f6",
            }}
        >
            <InstallerRail current={railCurrent(step)} finished={finished}/>
            <div style={{display: "flex", alignItems: "center", minWidth: 0}}>
                <div
                    className={copyClass}
                    style={{
                        maxWidth: 520,
                        width: "100%",
                        padding: "64px 48px",
                        boxSizing: "border-box",
                    }}
                >
                    <p
                        style={{
                            margin: 0,
                            fontSize: 12,
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            color: "#8a8a91",
                        }}
                    >
                        {copy.eyebrow}
                    </p>
                    <h1 style={{margin: "12px 0 0", fontSize: 32, fontWeight: 600, color: "#f3f4f6", lineHeight: 1.2}}>
                        {copy.title}
                    </h1>
                    <p style={{margin: "12px 0 0", fontSize: 14, color: "#b4b4b8", lineHeight: 1.45}}>
                        {climateLine}
                    </p>

                    {message ? (
                        <p
                            className="installer-error mt-6 rounded-md border border-amber-900/70 bg-amber-950/30 px-3 py-2 text-sm text-amber-200"
                            role="alert"
                        >
                            {message}
                        </p>
                    ) : null}

                    {step === "authenticate" ? (
                        <form className="mt-8 space-y-5" onSubmit={onAuthenticate}>
                            <SetupCodeInput
                                value={setupCode}
                                onChange={(next) => {
                                    setSetupCode(next);
                                    setCodeInvalid(false);
                                }}
                                disabled={locked}
                                invalid={codeInvalid}
                            />
                            <PrimaryButton className={saveClass} disabled={locked || !codeReady}>
                                {saveLabel ?? "Continue"}
                            </PrimaryButton>
                        </form>
                    ) : null}

                    {step === "admin" ? (
                        <form className="mt-8 space-y-5" onSubmit={onAdmin}>
                            <InstallerField label="Username" value={username} htmlFor="installer-username">
                                <InstallerInput
                                    id="installer-username"
                                    name="username"
                                    autoComplete="username"
                                    value={username}
                                    onChange={setUsername}
                                />
                            </InstallerField>
                            <div>
                                <InstallerField label="Password" value={password} htmlFor="installer-password">
                                    <InstallerInput
                                        id="installer-password"
                                        name="password"
                                        type="password"
                                        autoComplete="new-password"
                                        value={password}
                                        onChange={setPassword}
                                        underlined={false}
                                    />
                                </InstallerField>
                                <PasswordLine value={password}/>
                            </div>
                            <PrimaryButton className={saveClass} disabled={locked || !adminReady}>
                                {saveLabel ?? "Continue"}
                            </PrimaryButton>
                        </form>
                    ) : null}

                    {step === "climate" ? (
                        <form className="mt-8 space-y-5" onSubmit={onClimate}>
                            <InstallerField label="Email" value={sfEmail} htmlFor="installer-sf-email">
                                <InstallerInput
                                    id="installer-sf-email"
                                    name="sfEmail"
                                    type="email"
                                    autoComplete="username"
                                    value={sfEmail}
                                    onChange={setSfEmail}
                                />
                            </InstallerField>
                            <InstallerField label="Password" value={sfPassword} htmlFor="installer-sf-password">
                                <InstallerInput
                                    id="installer-sf-password"
                                    name="sfPassword"
                                    type="password"
                                    autoComplete="current-password"
                                    value={sfPassword}
                                    onChange={setSfPassword}
                                />
                            </InstallerField>
                            <PrimaryButton className={saveClass} disabled={locked}>
                                {saveLabel ?? "Continue"}
                            </PrimaryButton>
                            <SkipButton disabled={locked} onClick={() => void skip("climate", "camera")}>
                                Skip climate
                            </SkipButton>
                        </form>
                    ) : null}

                    {step === "climate-list" ? (
                        <form className="mt-8 space-y-5" onSubmit={onClimatePick}>
                            <ControllerList
                                controllers={controllers}
                                selected={selectedSerial}
                                onSelect={setSelectedSerial}
                            />
                            <PrimaryButton className={saveClass} disabled={locked || !selectedSerial}>
                                {saveLabel ?? "Use this controller"}
                            </PrimaryButton>
                            <SkipButton disabled={locked} onClick={() => void skip("climate", "camera")}>
                                Skip climate
                            </SkipButton>
                        </form>
                    ) : null}

                    {step === "camera" ? (
                        <form className="mt-8 space-y-5" onSubmit={onCamera}>
                            <InstallerField label="HLS source" value={streamUrl} htmlFor="installer-stream-url">
                                <InstallerInput
                                    id="installer-stream-url"
                                    name="streamUrl"
                                    autoComplete="off"
                                    value={streamUrl}
                                    onChange={setStreamUrl}
                                />
                            </InstallerField>
                            <PrimaryButton className={saveClass} disabled={locked}>
                                {saveLabel ?? "Continue"}
                            </PrimaryButton>
                            <SkipButton disabled={locked} onClick={() => void skip("camera", "twitch")}>
                                Skip camera
                            </SkipButton>
                        </form>
                    ) : null}

                    {step === "twitch" ? (
                        <form className="mt-8 space-y-5" onSubmit={onTwitch}>
                            <InstallerField label="Stream key" value={twitchKey} htmlFor="installer-twitch-key">
                                <InstallerInput
                                    id="installer-twitch-key"
                                    name="twitchKey"
                                    type="password"
                                    autoComplete="off"
                                    value={twitchKey}
                                    onChange={setTwitchKey}
                                />
                            </InstallerField>
                            <InstallerField label="Twitch channel" value={twitchLogin} htmlFor="installer-twitch-login">
                                <InstallerInput
                                    id="installer-twitch-login"
                                    name="twitchLogin"
                                    autoComplete="off"
                                    value={twitchLogin}
                                    onChange={setTwitchLogin}
                                />
                            </InstallerField>
                            <PrimaryButton className={saveClass} disabled={locked}>
                                {saveLabel ?? "Continue"}
                            </PrimaryButton>
                            <SkipButton disabled={locked} onClick={() => void skip("twitch", "timelapse")}>
                                Skip Twitch
                            </SkipButton>
                        </form>
                    ) : null}

                    {step === "timelapse" ? (
                        <form className="mt-8 space-y-5" onSubmit={onTimelapse}>
                            <InstallerField label="Camera RTSP URL" value={rtspStream} htmlFor="installer-rtsp">
                                <InstallerInput
                                    id="installer-rtsp"
                                    name="rtspStream"
                                    autoComplete="off"
                                    value={rtspStream}
                                    onChange={setRtspStream}
                                />
                            </InstallerField>
                            <InstallerField label="Interval (minutes)" value={interval} htmlFor="installer-interval">
                                <InstallerInput
                                    id="installer-interval"
                                    name="interval"
                                    type="number"
                                    autoComplete="off"
                                    value={interval}
                                    onChange={setIntervalMinutes}
                                />
                            </InstallerField>
                            <InstallerField label="Timezone" value={timezone} htmlFor="installer-timezone">
                                <InstallerInput
                                    id="installer-timezone"
                                    name="timezone"
                                    autoComplete="off"
                                    value={timezone}
                                    onChange={setTimezone}
                                />
                            </InstallerField>
                            <PrimaryButton className={saveClass} disabled={locked}>
                                {saveLabel ?? "Continue"}
                            </PrimaryButton>
                            <SkipButton disabled={locked} onClick={() => void skip("timelapse", "done")}>
                                Skip timelapse
                            </SkipButton>
                        </form>
                    ) : null}

                    {step === "done" ? (
                        <div className="mt-8 space-y-5">
                            <ul style={{listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12}}>
                                {installerDoneRows({
                                    username: savedUsername,
                                    climate: climateLabel,
                                    streamUrl: savedStreamUrl,
                                    twitchSaved,
                                    timelapse: timelapseLabel,
                                    skipped,
                                }).map((row) => (
                                    <li key={row.label} style={{display: "flex", flexDirection: "column", gap: 2}}>
                                        <span style={{fontSize: 12, color: "#8a8a91", textTransform: "uppercase", letterSpacing: "0.04em"}}>
                                            {row.label}
                                        </span>
                                        <span style={{fontSize: 14, color: "#f3f4f6"}}>{row.value}</span>
                                    </li>
                                ))}
                            </ul>
                            <PrimaryButton className="installer-save" disabled={locked} onClick={() => void onFinish()}>
                                {INSTALLER_COPY.done.button}
                            </PrimaryButton>
                        </div>
                    ) : null}
                </div>
            </div>
        </main>
    );
}

function InstallerField({
    label,
    value,
    htmlFor,
    children,
}: {
    label: string;
    value: string;
    htmlFor: string;
    children: ReactNode;
}) {
    return (
        <div
            className={`installer-field${value ? " filled" : ""}`}
            style={{position: "relative", paddingTop: 8}}
        >
            <label
                className="installer-label"
                htmlFor={htmlFor}
                style={{
                    position: "absolute",
                    left: 0,
                    top: 18,
                    fontSize: 14,
                    color: "#8a8a91",
                    pointerEvents: "none",
                    transformOrigin: "left top",
                }}
            >
                {label}
            </label>
            {children}
        </div>
    );
}

function InstallerInput({
    name,
    id,
    value,
    onChange,
    type = "text",
    autoComplete,
    underlined = true,
}: {
    name: string;
    id: string;
    value: string;
    onChange: (value: string) => void;
    type?: string;
    autoComplete?: string;
    underlined?: boolean;
}) {
    return (
        <input
            id={id}
            name={name}
            type={type}
            autoComplete={autoComplete}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            required={name !== "twitchLogin"}
            style={{
                display: "block",
                width: "100%",
                height: 40,
                margin: 0,
                padding: "16px 0 0",
                border: "none",
                borderBottom: underlined ? "1px solid #4a4a4a" : "none",
                borderRadius: 0,
                background: "transparent",
                color: "#f3f4f6",
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
            }}
        />
    );
}

function PrimaryButton({
    children,
    className,
    disabled,
    onClick,
}: {
    children: ReactNode;
    className: string;
    disabled?: boolean;
    onClick?: () => void;
}) {
    return (
        <button
            type={onClick ? "button" : "submit"}
            className={className}
            disabled={disabled}
            onClick={onClick}
            style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                height: 40,
                marginTop: 8,
                border: "none",
                borderRadius: 8,
                background: "#e4e4e7",
                color: "#09090b",
                fontSize: 14,
                fontWeight: 600,
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.55 : 1,
            }}
        >
            {children}
        </button>
    );
}

function SkipButton({
    children,
    disabled,
    onClick,
}: {
    children: ReactNode;
    disabled?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            style={{
                display: "block",
                width: "100%",
                marginTop: 4,
                padding: "8px 0",
                border: "none",
                background: "transparent",
                color: "#8a8a91",
                fontSize: 14,
                cursor: disabled ? "not-allowed" : "pointer",
            }}
        >
            {children}
        </button>
    );
}
