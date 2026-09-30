"use client";

import {useState} from "react";
import {useRouter} from "next/navigation";
import {AdminBand, AdminBandGroup} from "@/app/admin/admin-band";
import {
    cancelTotpSetupAction,
    confirmTotpSetupAction,
    disableTotpAction,
    discardCorruptTotpAction,
    regenerateRecoveryAction,
    startEnrollAction,
    startReplaceAction,
    type SecurityActionResult,
} from "@/app/admin/security/actions";
import {AdminButton, AdminField, AdminInput, AdminNotice} from "@/components/admin/ui";

export type SecurityPendingView = {
    manualKey: string;
    qrSvg: string;
    replacing: boolean;
};

export type SecurityView = {
    status: "off" | "pending" | "enrolled" | "corrupt";
    pending: SecurityPendingView | null;
};

function QrBlock({pending}: {pending: SecurityPendingView}) {
    return (
        <div className="space-y-3">
            <div
                className="w-44 rounded-md bg-white p-2 [&_svg]:h-auto [&_svg]:w-full"
                role="img"
                aria-label="Authenticator setup code"
                dangerouslySetInnerHTML={{__html: pending.qrSvg}}
            />
            <p className="font-mono text-sm break-all text-(--admin-text)">{pending.manualKey}</p>
        </div>
    );
}

export function SecurityPanel({view}: {view: SecurityView}) {
    const router = useRouter();
    const [message, setMessage] = useState<string | null>(null);
    const [codes, setCodes] = useState<string[] | null>(null);
    const [busy, setBusy] = useState(false);
    const [useRecovery, setUseRecovery] = useState(false);

    async function run(
        action: (formData: FormData) => Promise<SecurityActionResult>,
        formData = new FormData(),
    ) {
        setBusy(true);
        setMessage(null);
        try {
            const result = await action(formData);
            if (!result.ok) {
                setMessage(result.message);
                return;
            }
            if (result.recoveryCodes) {
                setCodes(result.recoveryCodes);
                return;
            }
            if (result.refresh) {
                router.refresh();
            }
        } finally {
            setBusy(false);
        }
    }

    if (codes) {
        return (
            <AdminBandGroup>
                <AdminBand id="recovery" title="Save recovery codes">
                    <div className="space-y-4">
                        <AdminNotice tone="warning" title="Shown once">
                            Store these codes somewhere you can open without this phone. Each code works one time.
                        </AdminNotice>
                        <ul className="space-y-1 font-mono text-sm text-(--admin-text)">
                            {codes.map((code) => (
                                <li key={code}>{code}</li>
                            ))}
                        </ul>
                        <AdminButton
                            type="button"
                            tone="primary"
                            onClick={() => {
                                setCodes(null);
                                router.refresh();
                            }}
                        >
                            I saved these codes
                        </AdminButton>
                    </div>
                </AdminBand>
            </AdminBandGroup>
        );
    }

    const pending = view.pending;

    return (
        <AdminBandGroup>
            {message ? (
                <AdminNotice tone="danger" title="Could not update authenticator">
                    {message}
                </AdminNotice>
            ) : null}

            <AdminBand id="authenticator" title="Authenticator">
                <div className="space-y-4">
                    {view.status === "corrupt" ? (
                        <AdminNotice tone="danger" title="Authenticator data unreadable">
                            Sign-in is blocked until this file is removed. Enter your password to remove it, or delete data/setup/totp.json on the server.
                        </AdminNotice>
                    ) : null}

                    {view.status === "off" ? (
                        <AdminButton type="button" tone="primary" disabled={busy} onClick={() => run(startEnrollAction)}>
                            Turn on authenticator
                        </AdminButton>
                    ) : null}

                    {pending ? (
                        <>
                            <QrBlock pending={pending}/>
                            <form
                                className="space-y-4"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    void run(confirmTotpSetupAction, new FormData(event.currentTarget));
                                }}
                            >
                                <AdminField label="Authenticator code">
                                    <AdminInput
                                        name="code"
                                        inputMode="numeric"
                                        autoComplete="one-time-code"
                                        required
                                        placeholder="123456"
                                    />
                                </AdminField>
                                <AdminButton type="submit" tone="primary" disabled={busy}>
                                    Confirm code
                                </AdminButton>
                            </form>
                            <AdminButton type="button" disabled={busy} onClick={() => run(cancelTotpSetupAction)}>
                                Cancel
                            </AdminButton>
                        </>
                    ) : null}

                    {view.status === "enrolled" && !pending ? (
                        <form
                            className="space-y-4"
                            onSubmit={(event) => {
                                event.preventDefault();
                                void run(startReplaceAction, new FormData(event.currentTarget));
                            }}
                        >
                            <AdminField label="Password">
                                <AdminInput name="password" type="password" autoComplete="current-password" required/>
                            </AdminField>
                            <AdminField label="Current authenticator code">
                                <AdminInput name="code" inputMode="numeric" autoComplete="one-time-code" required/>
                            </AdminField>
                            <AdminButton type="submit" tone="primary" disabled={busy}>
                                Switch to a new phone
                            </AdminButton>
                        </form>
                    ) : null}
                </div>
            </AdminBand>

            {view.status === "enrolled" && !pending ? (
                <AdminBand id="recovery" title="Recovery codes">
                    <form
                        className="space-y-4"
                        onSubmit={(event) => {
                            event.preventDefault();
                            void run(regenerateRecoveryAction, new FormData(event.currentTarget));
                        }}
                    >
                        <AdminField label="Password">
                            <AdminInput name="password" type="password" autoComplete="current-password" required/>
                        </AdminField>
                        <AdminField label="Authenticator code">
                            <AdminInput name="code" inputMode="numeric" autoComplete="one-time-code" required/>
                        </AdminField>
                        <AdminButton type="submit" tone="primary" disabled={busy}>
                            Generate new codes
                        </AdminButton>
                    </form>
                </AdminBand>
            ) : null}

            {view.status === "enrolled" || view.status === "corrupt" ? (
                <AdminBand id="turn-off" title="Turn off">
                    {view.status === "corrupt" ? (
                        <form
                            className="space-y-4"
                            onSubmit={(event) => {
                                event.preventDefault();
                                void run(discardCorruptTotpAction, new FormData(event.currentTarget));
                            }}
                        >
                            <AdminField label="Password">
                                <AdminInput name="password" type="password" autoComplete="current-password" required/>
                            </AdminField>
                            <AdminButton type="submit" tone="danger" disabled={busy}>
                                Remove unreadable authenticator data
                            </AdminButton>
                        </form>
                    ) : (
                        <form
                            className="space-y-4"
                            onSubmit={(event) => {
                                event.preventDefault();
                                void run(disableTotpAction, new FormData(event.currentTarget));
                            }}
                        >
                            <input type="hidden" name="kind" value={useRecovery ? "recovery" : "totp"}/>
                            <AdminField label="Password">
                                <AdminInput name="password" type="password" autoComplete="current-password" required/>
                            </AdminField>
                            <AdminField label={useRecovery ? "Recovery code" : "Authenticator code"}>
                                <AdminInput
                                    name="code"
                                    autoComplete="one-time-code"
                                    inputMode={useRecovery ? "text" : "numeric"}
                                    required
                                />
                            </AdminField>
                            <button
                                type="button"
                                className="block text-sm text-(--admin-muted) underline-offset-2 hover:underline"
                                onClick={() => setUseRecovery((current) => !current)}
                            >
                                {useRecovery ? "Use an authenticator code" : "Use a recovery code"}
                            </button>
                            <AdminButton type="submit" tone="danger" disabled={busy}>
                                Turn off authenticator
                            </AdminButton>
                        </form>
                    )}
                </AdminBand>
            ) : null}
        </AdminBandGroup>
    );
}
