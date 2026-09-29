"use server";

import {randomBytes} from "node:crypto";
import {headers} from "next/headers";
import {isAdminAuthenticated, loginAdmin, needsSetupWizard} from "@/lib/admin-auth";
import {
    hashAdminPassword,
    normalizeUsernameInput,
    validateUsernameInput,
} from "@/lib/admin-credentials";
import {validatePasswordStrength, MIN_PASSWORD_LENGTH} from "@/lib/password-policy";
import {prepareSpiderFarmer} from "@/lib/spider-farmer-setup";
import type {SpiderFarmerController} from "@/lib/spider-farmer-login";
import {updateCurrentGrow} from "@/lib/db";
import {adminSetupDecision, isOptionalInstallerStep} from "@/lib/installer-ready";
import {installerFinishCheck} from "@/lib/installer-progress";
import {markSetupComplete, readStoredAdminAccount, writeSkippedStep, writeStoredAdminAccount} from "@/lib/setup-account";
import {clearSetupCode, readSetupCode, setupCodesMatch} from "@/lib/setup-gate";
import {loginRateLimitKey} from "@/lib/request-trust";
import {isRtspUrl, writeTimelapseSidecarEnv} from "@/lib/timelapse-sidecar-env";
import {canonicalTimeZone, updateTimelapseSettings} from "@/lib/timelapse-settings";
import {
    readRestreamChannel,
    readRestreamKey,
    saveRestreamKey,
    writeRestreamChannel,
} from "@/lib/restream/store";
import {
    isInvalidTypedChannelLogin,
    resolveChannelLogin,
    streamKeyForChannelLookup,
} from "@/lib/restream/twitch-helix";
import {isSafeHttpUrl} from "@/lib/url-policy";

export type SetupStepResult =
    | {ok: true; detail?: string}
    | {ok: false; message: string; choose?: SpiderFarmerController[]};

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

async function loginDuringSetup(username: string, password: string) {
    const clientKey = loginRateLimitKey(await headers());
    return loginAdmin(username, password, clientKey);
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
        return {ok: false, message: "The account was saved, but sign-in did not complete. Try again."};
    }
    return {ok: true};
}

export async function setupClimateAction(formData: FormData): Promise<SetupStepResult> {
    const gate = await openSetup();
    if (gate) return gate;
    const result = await prepareSpiderFarmer({
        email: String(formData.get("sfEmail") ?? ""),
        password: String(formData.get("sfPassword") ?? ""),
        serial: String(formData.get("sfSerial") ?? ""),
    });
    if (result.ok) {
        return {ok: true, detail: result.name};
    }
    if ("choose" in result) {
        return {
            ok: false,
            message: "This account has more than one controller. Choose the climate controller.",
            choose: result.choose,
        };
    }
    if (result.notice === "spider_farmer_bad_password") {
        return {ok: false, message: "Spider Farmer did not accept that password."};
    }
    if (result.notice === "spider_farmer_unknown_account") {
        return {ok: false, message: "That email is not a Spider Farmer account."};
    }
    if (result.notice === "spider_farmer_no_controller") {
        return {ok: false, message: "Spider Farmer accepted the login and returned no controllers."};
    }
    if (result.notice === "spider_farmer_missing") {
        return {ok: false, message: "Enter the Spider Farmer email and password."};
    }
    return {ok: false, message: "Could not reach Spider Farmer. Try again."};
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
    if (!isOptionalInstallerStep(step)) {
        return {ok: false, message: "That step cannot be skipped."};
    }
    await writeSkippedStep(step);
    return {ok: true};
}

export async function setupTwitchAction(formData: FormData): Promise<SetupStepResult> {
    const gate = await openSetup();
    if (gate) return gate;
    const twitchKey = String(formData.get("twitchKey") ?? "");
    const typedLogin = String(formData.get("twitchLogin") ?? "");
    if (!twitchKey.trim()) {
        return {ok: false, message: "Enter a Twitch stream key."};
    }
    const previous = await readRestreamChannel();
    if (isInvalidTypedChannelLogin(typedLogin, previous.login)) {
        return {ok: false, message: "That channel name is not a Twitch login."};
    }
    const login = await resolveChannelLogin({
        typedLogin,
        streamKey: streamKeyForChannelLookup(twitchKey, await readRestreamKey()),
        previousLogin: previous.login,
    });
    await writeRestreamChannel({login, toastEnabled: previous.toastEnabled});
    await saveRestreamKey(twitchKey);
    return {ok: true};
}

export async function setupTimelapseAction(formData: FormData): Promise<SetupStepResult> {
    const gate = await openSetup();
    if (gate) return gate;
    const rtsp = String(formData.get("rtspStream") ?? "").trim();
    const timezone = String(formData.get("timezone") ?? "").trim();
    const intervalRaw = String(formData.get("interval") ?? "").trim();
    const interval = Number(intervalRaw);
    if (!isRtspUrl(rtsp)) {
        return {ok: false, message: "Use the camera’s local rtsp:// address, like rtsp://user:password@192.168.1.20:554/stream."};
    }
    if (!Number.isInteger(interval) || interval < 1) {
        return {ok: false, message: "Interval is a whole number of minutes, at least 1."};
    }
    const zone = canonicalTimeZone(timezone);
    if (!zone) {
        return {ok: false, message: "Timezone must be an IANA name, like Europe/Berlin."};
    }
    await updateTimelapseSettings({
        timezone: zone,
        intervalMinutes: interval,
    });
    await writeTimelapseSidecarEnv({
        RTSP_STREAM: rtsp,
        TZ: zone,
        INTERVAL: String(interval),
    });
    return {ok: true};
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
