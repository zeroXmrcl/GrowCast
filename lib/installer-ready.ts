import {isSafeHttpUrl} from "@/lib/url-policy";
import {INSTALLER_OPTIONAL_STEPS, type InstallerOptionalStep, type InstallerStepId} from "@/lib/installer-steps";
import {isRtspUrl} from "@/lib/timelapse-sidecar-env";

const STEP_LABEL: Record<InstallerOptionalStep | "admin", string> = {
    admin: "Admin",
    climate: "Climate",
    camera: "Camera",
    twitch: "Twitch",
    timelapse: "Timelapse",
};

export type InstallerFinishInput = {
    hasAdmin: boolean;
    skipped: readonly string[];
    climateConfigured: boolean;
    streamUrl: string;
    hasTwitchKey: boolean;
    rtsp: string;
};

export type InstallerFinishCheck = {ok: true} | {ok: false; message: string};

/** Create the first account, sign back into it, or refuse a different username. */
export function adminSetupDecision(
    existingUsername: string | null,
    submittedUsername: string,
): "create" | "sign-in" | "reject" {
    if (!existingUsername) {
        return "create";
    }
    if (existingUsername === submittedUsername) {
        return "sign-in";
    }
    return "reject";
}

function optionalStepSaved(input: InstallerFinishInput): Array<[InstallerOptionalStep, boolean]> {
    return [
        ["climate", input.climateConfigured],
        ["camera", isSafeHttpUrl(input.streamUrl)],
        ["twitch", input.hasTwitchKey],
        ["timelapse", isRtspUrl(input.rtsp)],
    ];
}

/** First step that still needs a save or a skip. */
export function nextInstallerStep(input: InstallerFinishInput): InstallerStepId | "done" {
    if (!input.hasAdmin) {
        return "admin";
    }
    const skipped = new Set(input.skipped);
    for (const [step, saved] of optionalStepSaved(input)) {
        if (!saved && !skipped.has(step)) {
            return step;
        }
    }
    return "done";
}

/** Setup can close only when the admin exists and every later step was saved or skipped. */
export function installerCanFinish(input: InstallerFinishInput): InstallerFinishCheck {
    const step = nextInstallerStep(input);
    if (step === "done") {
        return {ok: true};
    }
    if (step === "admin") {
        return {ok: false, message: "Create the admin account before opening the dashboard."};
    }
    return {ok: false, message: `Save or skip ${STEP_LABEL[step]} before opening the dashboard.`};
}

export function isOptionalInstallerStep(step: string): step is InstallerOptionalStep {
    return (INSTALLER_OPTIONAL_STEPS as readonly string[]).includes(step);
}
