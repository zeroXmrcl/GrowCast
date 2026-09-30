"use server";

import {headers} from "next/headers";
import {
    consumeAdminSecurityAttempt,
    gateAdminPassword,
    getAdminAccount,
    requireAdmin,
    resetAdminSecurityAttempts,
    type PasswordGateResult,
} from "@/lib/admin-auth";
import {
    beginTotpSetup,
    confirmPendingTotp,
    consumeSecondFactor,
    deleteAdminTotpFiles,
    deletePendingTotp,
    inspectAdminTotp,
    replaceRecoveryCodes,
} from "@/lib/admin-totp";
import {
    logAuthTotpDisabled,
    logAuthTotpEnrolled,
    logAuthTotpRecoveryUsed,
} from "@/lib/logging";
import {securityRateLimitKey} from "@/lib/request-trust";

export type SecurityActionResult =
    | {ok: true; recoveryCodes?: string[]; refresh?: boolean}
    | {ok: false; message: string};

async function clientKey(): Promise<string> {
    return securityRateLimitKey(await headers());
}

function passwordMessage(gate: Exclude<PasswordGateResult, {ok: true}>): string {
    if (gate.code === "rate_limited") {
        return "Too many attempts. Try again later.";
    }
    if (gate.code === "login_disabled") {
        return "Admin login is unavailable.";
    }
    return "That password or code was not accepted.";
}

function accountOf(account: ReturnType<typeof getAdminAccount>) {
    return {username: account.username, passwordHash: account.passwordHash};
}

export async function startEnrollAction(): Promise<SecurityActionResult> {
    await requireAdmin();
    const account = getAdminAccount();
    const gate = inspectAdminTotp(accountOf(account), account.secret);
    if (gate.state === "corrupt") {
        return {
            ok: false,
            message: "Authenticator data is unreadable. Remove it below, or delete data/setup/totp.json on the server.",
        };
    }
    if (gate.state === "enrolled") {
        return {ok: false, message: "Authenticator is already on. Use the new-phone form to replace it."};
    }
    await beginTotpSetup(accountOf(account), account.secret, account.username);
    return {ok: true, refresh: true};
}

export async function confirmTotpSetupAction(formData: FormData): Promise<SecurityActionResult> {
    await requireAdmin();
    const key = await clientKey();
    const rate = consumeAdminSecurityAttempt(key);
    if (!rate.allowed) {
        return {ok: false, message: "Too many attempts. Try again later."};
    }
    const account = getAdminAccount();
    const confirmed = await confirmPendingTotp(
        accountOf(account),
        account.secret,
        String(formData.get("code") ?? ""),
    );
    if (!confirmed.ok) {
        return {ok: false, message: "That code was not accepted. Use the current code from the authenticator app."};
    }
    resetAdminSecurityAttempts(key);
    logAuthTotpEnrolled();
    return {ok: true, recoveryCodes: confirmed.recoveryCodes};
}

export async function cancelTotpSetupAction(): Promise<SecurityActionResult> {
    await requireAdmin();
    await deletePendingTotp();
    return {ok: true, refresh: true};
}

export async function startReplaceAction(formData: FormData): Promise<SecurityActionResult> {
    await requireAdmin();
    const key = await clientKey();
    const gate = gateAdminPassword(String(formData.get("password") ?? ""), key);
    if (!gate.ok) {
        return {ok: false, message: passwordMessage(gate)};
    }
    const factor = await consumeSecondFactor(
        accountOf(gate.account),
        gate.account.secret,
        String(formData.get("code") ?? ""),
        "totp",
    );
    if (!factor.ok) {
        return {
            ok: false,
            message: factor.reason === "corrupt"
                ? "Authenticator data is unreadable. Delete data/setup/totp.json on the server."
                : "That password or code was not accepted.",
        };
    }
    resetAdminSecurityAttempts(key);
    await beginTotpSetup(accountOf(gate.account), gate.account.secret, gate.account.username);
    return {ok: true, refresh: true};
}

export async function regenerateRecoveryAction(formData: FormData): Promise<SecurityActionResult> {
    await requireAdmin();
    const key = await clientKey();
    const gate = gateAdminPassword(String(formData.get("password") ?? ""), key);
    if (!gate.ok) {
        return {ok: false, message: passwordMessage(gate)};
    }
    const factor = await consumeSecondFactor(
        accountOf(gate.account),
        gate.account.secret,
        String(formData.get("code") ?? ""),
        "totp",
    );
    if (!factor.ok) {
        return {ok: false, message: "That password or code was not accepted."};
    }
    const replaced = await replaceRecoveryCodes(accountOf(gate.account), gate.account.secret);
    if (!replaced.ok) {
        return {ok: false, message: "Authenticator data could not be updated."};
    }
    resetAdminSecurityAttempts(key);
    return {ok: true, recoveryCodes: replaced.recoveryCodes};
}

export async function disableTotpAction(formData: FormData): Promise<SecurityActionResult> {
    await requireAdmin();
    const key = await clientKey();
    const gate = gateAdminPassword(String(formData.get("password") ?? ""), key);
    if (!gate.ok) {
        return {ok: false, message: passwordMessage(gate)};
    }
    const kind = formData.get("kind") === "recovery" ? "recovery" : "totp";
    const factor = await consumeSecondFactor(
        accountOf(gate.account),
        gate.account.secret,
        String(formData.get("code") ?? ""),
        kind,
    );
    if (!factor.ok) {
        return {ok: false, message: "That password or code was not accepted."};
    }
    await deleteAdminTotpFiles();
    resetAdminSecurityAttempts(key);
    if (factor.method === "recovery") {
        logAuthTotpRecoveryUsed();
    }
    logAuthTotpDisabled();
    return {ok: true, refresh: true};
}

export async function discardCorruptTotpAction(formData: FormData): Promise<SecurityActionResult> {
    await requireAdmin();
    const account = getAdminAccount();
    const gate = inspectAdminTotp(accountOf(account), account.secret);
    if (gate.state !== "corrupt") {
        return {ok: false, message: "Authenticator data is readable. Use Turn off instead."};
    }
    const key = await clientKey();
    const passwordGate = gateAdminPassword(String(formData.get("password") ?? ""), key);
    if (!passwordGate.ok) {
        return {ok: false, message: passwordMessage(passwordGate)};
    }
    await deleteAdminTotpFiles();
    resetAdminSecurityAttempts(key);
    logAuthTotpDisabled();
    return {ok: true, refresh: true};
}
