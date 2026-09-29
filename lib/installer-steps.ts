export const INSTALLER_STEPS = ["admin", "climate", "camera", "twitch", "timelapse"] as const;
export type InstallerStepId = (typeof INSTALLER_STEPS)[number];

export const INSTALLER_OPTIONAL_STEPS = ["climate", "camera", "twitch", "timelapse"] as const;
export type InstallerOptionalStep = (typeof INSTALLER_OPTIONAL_STEPS)[number];

export type InstallerInitial = {
    step: InstallerStepId | "done";
    username: string;
    finished: InstallerStepId[];
    skipped: string[];
    streamUrl: string | null;
    climate: string | null;
    twitchSaved: boolean;
    timelapse: string | null;
};
