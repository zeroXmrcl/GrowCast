"use client";

import {useRouter} from "next/navigation";
import {useState} from "react";
import {
    createSetupAdminAction,
    finishSetupAction,
    setupClimateAction,
    setupTimelapseAction,
    setupTwitchAction,
} from "@/app/setup/actions";
import {AdminButton, AdminField, AdminInput, AdminSelect} from "@/components/admin/ui";
import {PasswordLine} from "@/app/setup/password-line";
import type {SpiderFarmerController} from "@/lib/spider-farmer-login";

type StepId = "account" | "choose" | "climate" | "twitch" | "timelapse";

const STEP_LABEL: Record<StepId, string> = {
    account: "Admin",
    choose: "Services",
    climate: "Climate",
    twitch: "Twitch",
    timelapse: "Timelapse",
};

export function SetupWizard() {
    const router = useRouter();
    const [step, setStep] = useState<StepId>("account");
    const [climate, setClimate] = useState(true);
    const [twitch, setTwitch] = useState(true);
    const [timelapse, setTimelapse] = useState(true);
    const [controllers, setControllers] = useState<SpiderFarmerController[]>([]);
    const [message, setMessage] = useState("");
    const [pending, setPending] = useState(false);
    const [adminPassword, setAdminPassword] = useState("");

    const steps: StepId[] = [
        "account",
        "choose",
        ...(climate ? ["climate" as const] : []),
        ...(twitch ? ["twitch" as const] : []),
        ...(timelapse ? ["timelapse" as const] : []),
    ];
    const index = Math.max(0, steps.indexOf(step));

    function goNext(from: StepId) {
        const plan: StepId[] = from === "choose"
            ? [
                "account",
                "choose",
                ...(climate ? ["climate" as const] : []),
                ...(twitch ? ["twitch" as const] : []),
                ...(timelapse ? ["timelapse" as const] : []),
            ]
            : steps;
        const at = plan.indexOf(from);
        const next = plan[at + 1];
        if (next) {
            setStep(next);
            setMessage("");
            return;
        }
        void finish();
    }

    async function finish() {
        setPending(true);
        try {
            const result = await finishSetupAction();
            if (!result.ok) {
                setMessage(result.message);
                return;
            }
            router.push("/");
            router.refresh();
        } finally {
            setPending(false);
        }
    }

    async function onAccount(formData: FormData) {
        const result = await createSetupAdminAction(formData);
        if (!result.ok) {
            setMessage(result.message);
            return;
        }
        goNext("account");
    }

    async function onClimate(formData: FormData) {
        const result = await setupClimateAction(formData);
        if (!result.ok) {
            setControllers(result.choose ?? []);
            setMessage(result.message);
            return;
        }
        setControllers([]);
        goNext("climate");
    }

    async function onTwitch(formData: FormData) {
        const result = await setupTwitchAction(formData);
        if (!result.ok) {
            setMessage(result.message);
            return;
        }
        goNext("twitch");
    }

    async function onTimelapse(formData: FormData) {
        const result = await setupTimelapseAction(formData);
        if (!result.ok) {
            setMessage(result.message);
            return;
        }
        goNext("timelapse");
    }

    async function submit(event: React.FormEvent<HTMLFormElement>, run: (formData: FormData) => Promise<void>) {
        event.preventDefault();
        setPending(true);
        setMessage("");
        try {
            await run(new FormData(event.currentTarget));
        } finally {
            setPending(false);
        }
    }

    return (
        <main className="admin-theme mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center bg-(--admin-bg) px-6 py-16 text-(--admin-text)">
            <p className="text-xs font-medium uppercase tracking-wide text-(--admin-subtle)">GrowCast setup</p>
            <h1 className="mt-2 text-2xl font-semibold">Get the stack ready</h1>
            <p className="mt-2 text-sm text-(--admin-muted)">
                Step {index + 1} of {steps.length}. Sidecars you skip keep running and can be configured later in admin settings.
            </p>
            <ol className="mt-6 flex flex-wrap gap-2">
                {steps.map((id, position) => (
                    <li
                        key={id}
                        className={position === index
                            ? "rounded-full bg-zinc-200 px-3 py-1 text-xs font-medium text-zinc-950"
                            : "rounded-full border border-(--admin-border) px-3 py-1 text-xs text-(--admin-muted)"}
                    >
                        {STEP_LABEL[id]}
                    </li>
                ))}
            </ol>

            {message ? (
                <p className="mt-6 rounded-md border border-amber-900/70 bg-amber-950/30 px-3 py-2 text-sm text-amber-200" role="alert">
                    {message}
                </p>
            ) : null}

            {step === "account" ? (
                <form className="mt-6 space-y-4" onSubmit={(event) => submit(event, onAccount)}>
                    <AdminField label="Admin username">
                        <AdminInput name="username" autoComplete="username" required/>
                    </AdminField>
                    <AdminField label="Password">
                        <AdminInput
                            name="password"
                            type="password"
                            autoComplete="new-password"
                            required
                            value={adminPassword}
                            onChange={(event) => setAdminPassword(event.target.value)}
                        />
                        <PasswordLine value={adminPassword}/>
                    </AdminField>
                    <AdminField label="Repeat password">
                        <AdminInput name="confirm" type="password" autoComplete="new-password" required/>
                    </AdminField>
                    <AdminButton type="submit" tone="primary" disabled={pending}>Continue</AdminButton>
                </form>
            ) : null}

            {step === "choose" ? (
                <form
                    className="mt-6 space-y-3"
                    onSubmit={(event) => {
                        event.preventDefault();
                        goNext("choose");
                    }}
                >
                    <ServiceChoice
                        checked={climate}
                        onChange={setClimate}
                        title="Climate"
                        detail="Spider Farmer email and password. The controller serial is discovered."
                    />
                    <ServiceChoice
                        checked={twitch}
                        onChange={setTwitch}
                        title="Twitch"
                        detail="Stream key and channel. Start stays on the Broadcast page."
                    />
                    <ServiceChoice
                        checked={timelapse}
                        onChange={setTimelapse}
                        title="Timelapse"
                        detail="Camera RTSP URL, interval, and timezone."
                    />
                    <AdminButton type="submit" tone="primary">Continue</AdminButton>
                </form>
            ) : null}

            {step === "climate" ? (
                <form className="mt-6 space-y-4" onSubmit={(event) => submit(event, onClimate)}>
                    <AdminField label="Spider Farmer email">
                        <AdminInput name="sfEmail" type="email" autoComplete="username" required/>
                    </AdminField>
                    <AdminField label="Password">
                        <AdminInput name="sfPassword" type="password" autoComplete="current-password" required/>
                    </AdminField>
                    {controllers.length > 1 ? (
                        <AdminField label="Climate controller">
                            <AdminSelect name="sfSerial" defaultValue={controllers[0]?.serial} required>
                                {controllers.map((controller) => (
                                    <option key={controller.serial} value={controller.serial}>
                                        {controller.name} ({controller.prefix})
                                    </option>
                                ))}
                            </AdminSelect>
                        </AdminField>
                    ) : null}
                    <AdminButton type="submit" tone="primary" disabled={pending}>Save climate</AdminButton>
                </form>
            ) : null}

            {step === "twitch" ? (
                <form className="mt-6 space-y-4" onSubmit={(event) => submit(event, onTwitch)}>
                    <AdminField label="Stream key">
                        <AdminInput name="twitchKey" type="password" autoComplete="off" required/>
                    </AdminField>
                    <AdminField label="Twitch channel" hint="Optional when the key includes the channel.">
                        <AdminInput name="twitchLogin" autoComplete="off" placeholder="channel_login"/>
                    </AdminField>
                    <AdminButton type="submit" tone="primary" disabled={pending}>Save Twitch</AdminButton>
                </form>
            ) : null}

            {step === "timelapse" ? (
                <form className="mt-6 space-y-4" onSubmit={(event) => submit(event, onTimelapse)}>
                    <AdminField label="Camera RTSP URL">
                        <AdminInput
                            name="rtspStream"
                            required
                            placeholder="rtsp://user:password@camera:554/stream"
                            autoComplete="off"
                        />
                    </AdminField>
                    <AdminField label="Interval (minutes)">
                        <AdminInput name="interval" type="number" min={1} step={1} defaultValue={15} required/>
                    </AdminField>
                    <AdminField label="Timezone">
                        <AdminInput name="timezone" defaultValue="UTC" required/>
                    </AdminField>
                    <AdminButton type="submit" tone="primary" disabled={pending}>Save timelapse</AdminButton>
                </form>
            ) : null}
        </main>
    );
}

function ServiceChoice({
    checked,
    onChange,
    title,
    detail,
}: {
    checked: boolean;
    onChange: (value: boolean) => void;
    title: string;
    detail: string;
}) {
    return (
        <label className="flex items-start gap-3 rounded-md border border-(--admin-border) bg-(--admin-surface) px-3 py-3">
            <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-zinc-300"
                checked={checked}
                onChange={(event) => onChange(event.target.checked)}
            />
            <span>
                <span className="block text-sm font-medium">{title}</span>
                <span className="mt-1 block text-xs text-(--admin-muted)">{detail}</span>
            </span>
        </label>
    );
}
