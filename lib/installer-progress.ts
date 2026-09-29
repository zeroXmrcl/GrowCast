import {isSafeHttpUrl} from "@/lib/url-policy";
import type {InstallerInitial, InstallerStepId} from "@/lib/installer-steps";
import {INSTALLER_STEPS} from "@/lib/installer-steps";
import {getCurrentGrow} from "@/lib/db";
import {readSpiderFarmerBrokerStatus} from "@/lib/ggs-sidecar-env";
import {installerCanFinish, isOptionalInstallerStep, nextInstallerStep, type InstallerFinishInput} from "@/lib/installer-ready";
import {hasRestreamKey} from "@/lib/restream/store";
import {readSkippedSteps, readStoredAdminAccount} from "@/lib/setup-account";
import {isRtspUrl, readTimelapseRtsp} from "@/lib/timelapse-sidecar-env";

type InstallerSnapshot = InstallerFinishInput & {
    username: string;
    climateSerial: string | null;
};

async function readInstallerSnapshot(): Promise<InstallerSnapshot> {
    const [account, skipped, climate, grow, twitchKey, rtsp] = await Promise.all([
        Promise.resolve(readStoredAdminAccount()),
        readSkippedSteps(),
        readSpiderFarmerBrokerStatus(),
        getCurrentGrow(),
        hasRestreamKey(),
        readTimelapseRtsp(),
    ]);
    return {
        hasAdmin: account !== null,
        username: account?.username ?? "",
        skipped,
        climateConfigured: climate.configured,
        climateSerial: climate.serial,
        streamUrl: grow.streamUrl,
        hasTwitchKey: twitchKey,
        rtsp,
    };
}

/** Where a signed-in installer should resume. Does not include secrets. */
export async function readInstallerProgress(): Promise<InstallerInitial> {
    const snap = await readInstallerSnapshot();
    const skipped = new Set(snap.skipped);
    const saved = {
        climate: snap.climateConfigured,
        camera: isSafeHttpUrl(snap.streamUrl),
        twitch: snap.hasTwitchKey,
        timelapse: isRtspUrl(snap.rtsp),
    };
    const finished: InstallerStepId[] = INSTALLER_STEPS.filter((step) => {
        if (step === "authenticate" || step === "admin") return snap.hasAdmin;
        return isOptionalInstallerStep(step) && saved[step] && !skipped.has(step);
    });

    return {
        step: nextInstallerStep(snap),
        username: snap.username,
        finished,
        skipped: [...snap.skipped],
        streamUrl: saved.camera ? snap.streamUrl : null,
        climate: saved.climate ? snap.climateSerial : null,
        twitchSaved: snap.hasTwitchKey,
        timelapse: saved.timelapse ? "Saved" : null,
    };
}

export async function installerFinishCheck() {
    return installerCanFinish(await readInstallerSnapshot());
}
