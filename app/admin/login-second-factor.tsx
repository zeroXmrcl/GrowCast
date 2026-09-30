"use client";

import {useState} from "react";
import {AdminButton, AdminField, AdminInput, AdminNotice} from "@/components/admin/ui";

type LoginSecondFactorFormProps = {
    error?: string;
    verifyAction: (formData: FormData) => Promise<void>;
    cancelAction: () => Promise<void>;
};

export function LoginSecondFactorForm({error, verifyAction, cancelAction}: LoginSecondFactorFormProps) {
    const [useRecovery, setUseRecovery] = useState(false);

    return (
        <div className="space-y-4">
            {error === "totp_invalid" ? (
                <AdminNotice tone="danger" title="Code not accepted">
                    That code was not accepted. Try the next authenticator code, or a recovery code.
                </AdminNotice>
            ) : null}

            <form action={verifyAction} className="space-y-4">
                <input type="hidden" name="kind" value={useRecovery ? "recovery" : "totp"}/>
                <AdminField
                    label={useRecovery ? "Recovery code" : "Authenticator code"}
                    hint={useRecovery ? "One of the codes you saved when authenticator was turned on." : undefined}
                >
                    <AdminInput
                        name="code"
                        autoComplete="one-time-code"
                        inputMode={useRecovery ? "text" : "numeric"}
                        autoFocus
                        required
                        pattern={useRecovery ? undefined : "[0-9]*"}
                        placeholder={useRecovery ? "xxxx-xxxx-xxxx-xxxx" : "123456"}
                    />
                </AdminField>
                <button
                    type="button"
                    className="text-sm text-(--admin-muted) underline-offset-2 hover:underline"
                    onClick={() => setUseRecovery((current) => !current)}
                >
                    {useRecovery ? "Use an authenticator code" : "Use a recovery code"}
                </button>
                <AdminButton type="submit" tone="primary" className="w-full">
                    Continue
                </AdminButton>
            </form>
            <form action={cancelAction}>
                <AdminButton type="submit" className="w-full">
                    Start over
                </AdminButton>
            </form>
        </div>
    );
}
