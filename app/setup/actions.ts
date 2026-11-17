"use server";

import {randomBytes} from "node:crypto";
import {headers} from "next/headers";
import {isAdminAuthenticated, loginAdmin, needsSetupWizard, clearPendingAdminLogin, type LoginResult} from "@/lib/admin-auth";
import {
    hashAdminPassword,
    normalizeUsernameInput,
    validateUsernameInput,
} from "@/lib/admin-credentials";
import {validatePasswordStrength, MIN_PASSWORD_LENGTH} from "@/lib/password-policy";
import {updateCurrentGrow} from "@/lib/db";
import {adminSetupDecision} from "@/lib/installer-ready";
import {installerFinishCheck, isOptionalInstallerStep, listInstallerPlan} from "@/lib/installer-progress";
import {runPluginSetup} from "@/lib/plugins/hooks";
import type {PluginSetupResult} from "@/lib/plugins/types";
import {markSetupComplete, readStoredAdminAccount, writeSkippedStep, writeStoredAdminAccount} from "@/lib/setup-account";
import {clearSetupCode, readSetupCode, setupCodesMatch} from "@/lib/setup-gate";
import {loginRateLimitKey} from "@/lib/request-trust";
import {isSafeHttpUrl} from "@/lib/url-policy";

export type SetupStepResult = PluginSetupResult;

function closed(): SetupStepResult {
    return {ok: false, message: "Setup is already finished."};
}

async function openSetup(): Promise<SetupStepResult | null> {
    if (!needsSetupWizard()) {
        return closed();
    }
    if (!(await isAdminAuthenticated())) {
        return {ok: false, message: "Sign in on this browser before continuing setup."};
    }
    return null;
}

function setupCodeRejected(): SetupStepResult {
    return {
        ok: false,
        message: "That setup code does not match. It is printed in the GrowCast log when the container starts.",
    };
}

async function loginDuringSetup(username: string, password: string): Promise<LoginResult> {
    const clientKey = loginRateLimitKey(await headers());
    const login = await loginAdmin(username, password, clientKey);
    if (!login.ok && (login.code === "totp_required" || login.code === "totp_unavailable")) {
        await clearPendingAdminLogin();
    }
    return login;
}

function setupLoginError(login: Exclude<LoginResult, {ok: true}>): string {
    if (login.code === "totp_required") {
        return "This account uses an authenticator. Finish sign-in on the admin page after setup. If the setup wizard is still open, delete data/setup/totp.json and sign in again.";
    }
    if (login.code === "totp_unavailable") {
        return "Authenticator data could not be read. Delete data/setup/totp.json and sign in again.";
    }
    return "That password does not match the admin account.";
}

export async function confirmSetupCodeAction(setupCode: string): Promise<SetupStepResult> {
    if (!needsSetupWizard()) {
        return closed();
    }
    const expectedCode = readSetupCode();
    if (!expectedCode || !setupCodesMatch(setupCode, expectedCode)) {
        return setupCodeRejected();
    }
    return {ok: true};
}

export async function createSetupAdminAction(formData: FormData): Promise<SetupStepResult> {
    if (!needsSetupWizard()) {
        return closed();
    }
    const expectedCode = readSetupCode();
    if (!expectedCode || !setupCodesMatch(String(formData.get("setupCode") ?? ""), expectedCode)) {
        return setupCodeRejected();
    }
    const username = normalizeUsernameInput(String(formData.get("username") ?? ""));
    const password = String(formData.get("password") ?? "");
    if (!validateUsernameInput(username)) {
        return {ok: false, message: "Use 1–64 characters: letters, numbers, and . _ @ -."};
    }
    if (!validatePasswordStrength(password)) {
        return {ok: false, message: `Use at least ${MIN_PASSWORD_LENGTH} characters.`};
    }
    const existing = readStoredAdminAccount();
    const decision = adminSetupDecision(
        existing ? normalizeUsernameInput(existing.username) : null,
        username,
    );
    if (decision === "reject") {
        return {ok: false, message: "This installer already has an admin account."};
    }
    if (decision === "sign-in") {
        const login = await loginDuringSetup(username, password);
        if (!login.ok) {
            if (login.code === "totp_required" || login.code === "totp_unavailable") {
                return {ok: false, message: setupLoginError(login)};
            }
            return {ok: false, message: "That password does not match the admin account."};
        }
        return {ok: true};
    }
    await writeStoredAdminAccount({
        username,
        passwordHash: hashAdminPassword(password),
        sessionSecret: randomBytes(48).toString("base64url"),
    });
    const login = await loginDuringSetup(username, password);
    if (!login.ok) {
        if (login.code === "totp_required" || login.code === "totp_unavailable") {
            return {ok: false, message: setupLoginError(login)};
        }
        return {ok: false, message: "The account was saved, but sign-in did not complete. Try again."};
    }
    return {ok: true};
}

export async function setupCameraAction(formData: FormData): Promise<SetupStepResult> {
    const gate = await openSetup();
    if (gate) return gate;
    const streamUrl = String(formData.get("streamUrl") ?? "").trim();
    if (!isSafeHttpUrl(streamUrl)) {
        return {ok: false, message: "Paste a browser link, starting with http:// or https://."};
    }
    await updateCurrentGrow({streamUrl});
    return {ok: true};
}

export async function skipInstallerStepAction(step: string): Promise<SetupStepResult> {
    const gate = await openSetup();
    if (gate) return gate;
    const plan = await listInstallerPlan();
    if (!isOptionalInstallerStep(step, plan)) {
        return {ok: false, message: "That step cannot be skipped."};
    }
    await writeSkippedStep(step);
    return {ok: true};
}

export async function setupPluginAction(formData: FormData): Promise<SetupStepResult> {
    const gate = await openSetup();
    if (gate) return gate;
    const stepId = String(formData.get("stepId") ?? "").trim();
    if (!stepId) {
        return {ok: false, message: "Unknown setup step."};
    }
    const result = await runPluginSetup(stepId, formData);
    if (!result) {
        return {ok: false, message: "That setup step is not available."};
    }
    return result;
}

export async function finishSetupAction(): Promise<SetupStepResult> {
    const gate = await openSetup();
    if (gate) return gate;
    const ready = await installerFinishCheck();
    if (!ready.ok) {
        return ready;
    }
    await markSetupComplete();
    await clearSetupCode();
    return {ok: true};
}
