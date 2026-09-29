"use server";

import {randomBytes} from "node:crypto";
import {loginAdmin, needsSetupWizard} from "@/lib/admin-auth";
import {
    hashAdminPassword,
    normalizeUsernameInput,
    validateUsernameInput,
} from "@/lib/admin-credentials";
import {validatePasswordStrength, MIN_PASSWORD_LENGTH} from "@/lib/password-policy";
import {prepareSpiderFarmer} from "@/lib/spider-farmer-setup";
import type {SpiderFarmerController} from "@/lib/spider-farmer-login";
import {updateCurrentGrow} from "@/lib/db";
import {markSetupComplete, writeSkippedStep, writeStoredAdminAccount} from "@/lib/setup-account";
import {isRtspUrl, writeTimelapseSidecarEnv} from "@/lib/timelapse-sidecar-env";
import {updateTimelapseSettings} from "@/lib/timelapse-settings";
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
import {isInstallerStreamUrl} from "./installer-url";

export type SetupStepResult =
    | {ok: true}
    | {ok: false; message: string; choose?: SpiderFarmerController[]};

function closed(): SetupStepResult {
    return {ok: false, message: "Setup is already finished."};
}

export async function createSetupAdminAction(formData: FormData): Promise<SetupStepResult> {
    if (!needsSetupWizard()) {
        return closed();
    }
    const username = normalizeUsernameInput(String(formData.get("username") ?? ""));
    const password = String(formData.get("password") ?? "");
    const confirm = String(formData.get("confirm") ?? "");
    if (!validateUsernameInput(username)) {
        return {ok: false, message: "Use 1–64 characters: letters, numbers, and . _ @ -."};
    }
    if (password !== confirm) {
        return {ok: false, message: "Passwords do not match."};
    }
    if (!validatePasswordStrength(password)) {
        return {ok: false, message: `Use at least ${MIN_PASSWORD_LENGTH} characters.`};
    }
    await writeStoredAdminAccount({
        username,
        passwordHash: hashAdminPassword(password),
        sessionSecret: randomBytes(48).toString("base64url"),
    });
    const login = await loginAdmin(username, password);
    if (!login.ok) {
        return {ok: false, message: "The account was saved, but sign-in did not complete. Try again."};
    }
    return {ok: true};
}

export async function setupClimateAction(formData: FormData): Promise<SetupStepResult> {
    if (!needsSetupWizard()) {
        return closed();
    }
    const result = await prepareSpiderFarmer({
        email: String(formData.get("sfEmail") ?? ""),
        password: String(formData.get("sfPassword") ?? ""),
        serial: String(formData.get("sfSerial") ?? ""),
    });
    if (result.ok) {
        return {ok: true};
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
    if (!needsSetupWizard()) {
        return closed();
    }
    const streamUrl = String(formData.get("streamUrl") ?? "").trim();
    if (!isInstallerStreamUrl(streamUrl)) {
        return {ok: false, message: "Paste a browser link, starting with http:// or https://."};
    }
    await updateCurrentGrow({streamUrl});
    return {ok: true};
}

const SKIPPABLE_INSTALLER_STEPS = new Set(["climate", "camera", "twitch", "timelapse"]);

export async function skipInstallerStepAction(step: string): Promise<SetupStepResult> {
    if (!needsSetupWizard()) {
        return closed();
    }
    if (!SKIPPABLE_INSTALLER_STEPS.has(step)) {
        return {ok: false, message: "That step cannot be skipped."};
    }
    await writeSkippedStep(step);
    return {ok: true};
}

export async function setupTwitchAction(formData: FormData): Promise<SetupStepResult> {
    if (!needsSetupWizard()) {
        return closed();
    }
    const twitchKey = String(formData.get("twitchKey") ?? "");
    const typedLogin = String(formData.get("twitchLogin") ?? "");
    if (!twitchKey.trim()) {
        return {ok: false, message: "Enter a Twitch stream key."};
    }
    await saveRestreamKey(twitchKey);
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
    return {ok: true};
}

export async function setupTimelapseAction(formData: FormData): Promise<SetupStepResult> {
    if (!needsSetupWizard()) {
        return closed();
    }
    const rtsp = String(formData.get("rtspStream") ?? "").trim();
    const timezone = String(formData.get("timezone") ?? "").trim();
    const intervalRaw = String(formData.get("interval") ?? "").trim();
    const interval = Number(intervalRaw);
    if (!isRtspUrl(rtsp)) {
        return {ok: false, message: "Enter an RTSP URL, like rtsp://user:password@camera:554/stream."};
    }
    if (!Number.isInteger(interval) || interval < 1) {
        return {ok: false, message: "Interval is a whole number of minutes, at least 1."};
    }
    try {
        new Intl.DateTimeFormat("en-US", {timeZone: timezone});
    } catch {
        return {ok: false, message: "Timezone must be an IANA name, like Europe/Berlin."};
    }
    await updateTimelapseSettings({
        timezone,
        intervalMinutes: interval,
    });
    await writeTimelapseSidecarEnv({
        RTSP_STREAM: rtsp,
        TZ: timezone,
        INTERVAL: String(interval),
    });
    return {ok: true};
}

export async function finishSetupAction(): Promise<SetupStepResult> {
    if (!needsSetupWizard()) {
        return {ok: true};
    }
    await markSetupComplete();
    return {ok: true};
}
