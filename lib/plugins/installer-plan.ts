export type InstallerPlanStep = {
    id: string;
    sort: number;
    label: string;
    title: string;
    line: string;
    optional: boolean;
    kind: "core" | "plugin";
    pluginId?: string;
};

export const CORE_INSTALLER_STEPS: InstallerPlanStep[] = [
    {
        id: "authenticate",
        sort: 0,
        label: "Authenticate",
        title: "Enter the setup code",
        line: "It is printed in the GrowCast log when the container starts.",
        optional: false,
        kind: "core",
    },
    {
        id: "admin",
        sort: 10,
        label: "Admin",
        title: "Create the admin account",
        line: "The password needs 12 characters.",
        optional: false,
        kind: "core",
    },
    {
        id: "camera",
        sort: 20,
        label: "Camera",
        title: "Link your camera",
        line: "Paste the MediaMTX HLS source, like http://stream.example.com/growcam/.",
        optional: true,
        kind: "core",
    },
];

export const INSTALLER_DONE_COPY = {
    eyebrow: "Ready",
    title: "The stack is set up",
    line: "You can change any of this later in admin settings.",
    button: "Open the dashboard",
} as const;

export type InstallerStepStatus = {
    id: string;
    complete: boolean;
    detail: string | null;
};

export type InstallerProgress = {
    step: string;
    username: string;
    finished: string[];
    skipped: string[];
    streamUrl: string | null;
    steps: InstallerPlanStep[];
    details: Record<string, string | null>;
};

export function installerCanFinish(progress: Pick<InstallerProgress, "username" | "finished" | "skipped" | "steps">): {
    ok: true;
} | {ok: false; message: string} {
    if (!progress.username) {
        return {ok: false, message: "Create the admin account before opening the dashboard."};
    }
    const skipped = new Set(progress.skipped);
    const finished = new Set(progress.finished);
    for (const step of progress.steps) {
        if (!step.optional) {
            continue;
        }
        if (!finished.has(step.id) && !skipped.has(step.id)) {
            return {ok: false, message: `Save or skip ${step.label} before opening the dashboard.`};
        }
    }
    return {ok: true};
}

export function isOptionalInstallerStep(step: string, plan: InstallerPlanStep[]): boolean {
    return plan.some((item) => item.id === step && item.optional);
}

export function installerDoneRows(input: {
    username: string;
    skipped: readonly string[];
    steps: InstallerPlanStep[];
    details: Record<string, string | null>;
}): Array<{label: string; value: string}> {
    const skipped = new Set(input.skipped);
    const rows = [{label: "Admin", value: input.username}];
    for (const step of input.steps) {
        if (!step.optional) {
            continue;
        }
        const detail = input.details[step.id];
        rows.push({
            label: step.label,
            value: skipped.has(step.id) ? "Skipped" : (detail ?? "Skipped"),
        });
    }
    return rows;
}
