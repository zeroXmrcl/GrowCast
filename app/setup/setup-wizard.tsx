"use client";

import {useRouter} from "next/navigation";
import {useEffect, useRef, useState, type FormEvent, type ReactNode} from "react";
import {
    createSetupAdminAction,
    confirmSetupCodeAction,
    finishSetupAction,
    setupCameraAction,
    setupPluginAction,
    skipInstallerStepAction,
} from "@/app/setup/actions";
import {INSTALLER_COPY} from "@/app/setup/installer-copy";
import {InstallerRail} from "@/app/setup/installer-rail";
import {PasswordLine} from "@/app/setup/password-line";
import {SetupCodeInput} from "@/app/setup/setup-code-input";
import {passwordLineMet} from "./password-meter";
import {normalizeUsernameInput, validateUsernameInput} from "@/lib/admin-username";
import {ClimateControllerPicker, PluginSetupFields} from "@/lib/plugins/setup-ui";
import {installerDoneRows, type InstallerPlanStep} from "@/lib/plugins/installer";
import type {InstallerProgress} from "@/lib/installer-progress";
import {SETUP_CODE_LENGTH} from "@/lib/setup-code";
import type {PluginSetupResult} from "@/lib/plugins/types";

type WizardStep = string;
type ControllerChoice = NonNullable<Extract<PluginSetupResult, {ok: false}>["choose"]>[number];

function prefersReducedMotion(): boolean {
    return typeof window !== "undefined"
        && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function nextAfter(plan: InstallerPlanStep[], currentId: string): string {
    const idx = plan.findIndex((step) => step.id === currentId);
    if (idx < 0 || idx >= plan.length - 1) {
        return "done";
    }
    return plan[idx + 1]?.id ?? "done";
}

function stepCopy(
    step: WizardStep,
    plan: InstallerPlanStep[],
): {eyebrow: string; title: string; line: string} {
    if (step === "climate-list") {
        const climate = plan.find((item) => item.id === "climate");
        return {
            eyebrow: climate?.label ?? "Climate",
            title: "Choose the controller",
            line: "",
        };
    }
    if (step === "done") {
        return INSTALLER_COPY.done;
    }
    if (step === "authenticate") {
        return INSTALLER_COPY.authenticate;
    }
    if (step === "admin") {
        return INSTALLER_COPY.admin;
    }
    if (step === "camera") {
        return INSTALLER_COPY.camera;
    }
    const found = plan.find((item) => item.id === step);
    if (found) {
        return {eyebrow: found.label, title: found.title, line: found.line};
    }
    return INSTALLER_COPY.done;
}

export function SetupWizard({initial}: {initial: InstallerProgress}) {
    const router = useRouter();
    const plan = initial.steps;
    const railSteps = plan.filter((step) => step.id !== "authenticate").map((step) => ({
        id: step.id,
        label: step.label,
    }));
    const runGate = useRef(false);
    const goGeneration = useRef(0);
    const goTimeouts = useRef<number[]>([]);
    const goRafs = useRef<number[]>([]);

    const [step, setStep] = useState<WizardStep>(initial.step);
    const [finished, setFinished] = useState<ReadonlySet<string>>(() => new Set(initial.finished));
    const [skipped, setSkipped] = useState<string[]>(initial.skipped);
    const [details, setDetails] = useState<Record<string, string | null>>(initial.details);
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
    const [controllers, setControllers] = useState<ControllerChoice[]>([]);
    const [selectedSerial, setSelectedSerial] = useState("");
    const [streamUrl, setStreamUrl] = useState("");

    const copy = stepCopy(step, plan);
    const line = step === "climate-list" ? `Signed in as ${sfEmail}.` : copy.line;
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

    function markFinished(id: string) {
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

    async function skip(id: string) {
        await runLocked(async () => {
            const result = await skipInstallerStepAction(id);
            if (!result.ok) {
                setMessage(result.message);
                return;
            }
            setSkipped((prev) => (prev.includes(id) ? prev : [...prev, id]));
            await go(nextAfter(plan, id === "climate-list" ? "climate" : id), false);
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
            setUsername(username);
            markFinished("admin");
            await go(nextAfter(plan, "admin"), true);
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
            setDetails((prev) => ({...prev, camera: streamUrl.trim()}));
            markFinished("camera");
            await go(nextAfter(plan, "camera"), true);
        });
    }

    async function onPlugin(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        const stepId = String(new FormData(form).get("stepId") ?? step);
        await runLocked(async () => {
            const formData = new FormData(form);
            if (stepId === "climate") {
                setSfEmail(String(formData.get("sfEmail") ?? ""));
                setSfPassword(String(formData.get("sfPassword") ?? ""));
            }
            const result = await setupPluginAction(formData);
            if (result.ok) {
                setDetails((prev) => ({...prev, [stepId]: result.detail ?? prev[stepId] ?? "Saved"}));
                markFinished(stepId);
                await go(nextAfter(plan, stepId), true);
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
    const pluginStep = plan.find((item) => item.id === step && item.kind === "plugin");

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
            <InstallerRail
                current={step === "climate-list" ? "climate" : step}
                finished={finished}
                steps={railSteps}
            />
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
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                            color: "#8a8a91",
                        }}
                    >
                        {copy.eyebrow}
                    </p>
                    <h1 style={{margin: "8px 0 12px", fontSize: 28, fontWeight: 600}}>{copy.title}</h1>
                    {line ? <p style={{margin: 0, fontSize: 14, color: "#c4c4c8"}}>{line}</p> : null}
                    {message ? (
                        <p style={{margin: "16px 0 0", fontSize: 14, color: "#fca5a5"}}>{message}</p>
                    ) : null}

                    {step === "authenticate" ? (
                        <form className="mt-8 space-y-5" onSubmit={onAuthenticate}>
                            <SetupCodeInput
                                value={setupCode}
                                invalid={codeInvalid}
                                onChange={(value) => {
                                    setSetupCode(value);
                                    setCodeInvalid(false);
                                }}
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
                            <PasswordLine value={password} />
                            <PrimaryButton className={saveClass} disabled={locked || !adminReady}>
                                {saveLabel ?? "Continue"}
                            </PrimaryButton>
                        </form>
                    ) : null}

                    {step === "camera" ? (
                        <form className="mt-8 space-y-5" onSubmit={onCamera}>
                            <InstallerField label="Camera URL" value={streamUrl} htmlFor="installer-stream">
                                <InstallerInput
                                    id="installer-stream"
                                    name="streamUrl"
                                    autoComplete="off"
                                    value={streamUrl}
                                    onChange={setStreamUrl}
                                />
                            </InstallerField>
                            <PrimaryButton className={saveClass} disabled={locked}>
                                {saveLabel ?? "Continue"}
                            </PrimaryButton>
                            <SkipButton disabled={locked} onClick={() => void skip("camera")}>
                                Skip camera
                            </SkipButton>
                        </form>
                    ) : null}

                    {pluginStep ? (
                        <PluginSetupFields
                            stepId={pluginStep.id}
                            locked={locked}
                            saveClass={saveClass}
                            saveLabel={saveLabel}
                            onSubmit={onPlugin}
                            onSkip={() => void skip(pluginStep.id)}
                        />
                    ) : null}

                    {step === "climate-list" ? (
                        <ClimateControllerPicker
                            email={sfEmail}
                            password={sfPassword}
                            controllers={controllers}
                            selected={selectedSerial}
                            onSelect={setSelectedSerial}
                            locked={locked}
                            saveClass={saveClass}
                            saveLabel={saveLabel}
                            onSubmit={onPlugin}
                        />
                    ) : null}

                    {step === "done" ? (
                        <div className="mt-8 space-y-5">
                            <ul style={{listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12}}>
                                {installerDoneRows({
                                    username: initial.username || username,
                                    skipped,
                                    steps: plan,
                                    details: {
                                        ...details,
                                        camera: details.camera ?? (streamUrl || initial.streamUrl),
                                    },
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
