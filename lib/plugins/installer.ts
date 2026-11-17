import {isSafeHttpUrl} from "@/lib/url-policy";
import {getCurrentGrow} from "@/lib/db";
import {discoverPlugins} from "@/lib/plugins/discovery";
import {pluginSetupStatus} from "@/lib/plugins/hooks";
import {
    CORE_INSTALLER_STEPS,
    installerCanFinish,
    type InstallerPlanStep,
    type InstallerProgress,
} from "@/lib/plugins/installer-plan";
import {readSkippedSteps, readStoredAdminAccount} from "@/lib/setup-account";
import type {PluginInstallerSpec} from "@/lib/plugins/types";

export {
    CORE_INSTALLER_STEPS,
    INSTALLER_DONE_COPY,
    installerCanFinish,
    installerDoneRows,
    isOptionalInstallerStep,
    type InstallerPlanStep,
    type InstallerProgress,
    type InstallerStepStatus,
} from "@/lib/plugins/installer-plan";

function pluginInstallerStep(pluginId: string, spec: PluginInstallerSpec): InstallerPlanStep {
    return {
        id: spec.stepId,
        sort: spec.sort,
        label: spec.label,
        title: spec.title,
        line: spec.line,
        optional: true,
        kind: "plugin",
        pluginId,
    };
}

export async function listInstallerPlan(): Promise<InstallerPlanStep[]> {
    const {plugins} = await discoverPlugins();
    const pluginSteps = plugins
        .filter((plugin) => plugin.manifest.installer)
        .map((plugin) => pluginInstallerStep(plugin.manifest.id, plugin.manifest.installer!));
    return [...CORE_INSTALLER_STEPS, ...pluginSteps].sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id));
}

export async function readInstallerProgress(): Promise<InstallerProgress> {
    const [account, skipped, grow, plan] = await Promise.all([
        Promise.resolve(readStoredAdminAccount()),
        readSkippedSteps(),
        getCurrentGrow(),
        listInstallerPlan(),
    ]);
    const skippedSet = new Set(skipped);
    const hasAdmin = account !== null;
    const streamSaved = isSafeHttpUrl(grow.streamUrl);
    const details: Record<string, string | null> = {
        camera: streamSaved ? grow.streamUrl : null,
    };
    const complete = new Set<string>();
    if (hasAdmin) {
        complete.add("authenticate");
        complete.add("admin");
    }
    if (streamSaved && !skippedSet.has("camera")) {
        complete.add("camera");
    }
    for (const step of plan) {
        if (step.kind !== "plugin") {
            continue;
        }
        const status = await pluginSetupStatus(step.id);
        details[step.id] = status?.detail ?? null;
        if (status?.complete && !skippedSet.has(step.id)) {
            complete.add(step.id);
        }
    }

    const finished = plan.filter((step) => complete.has(step.id) || (step.optional && skippedSet.has(step.id)))
        .map((step) => step.id);

    let next = "done";
    if (!hasAdmin) {
        next = "admin";
    } else {
        for (const step of plan) {
            if (!step.optional) {
                continue;
            }
            if (!complete.has(step.id) && !skippedSet.has(step.id)) {
                next = step.id;
                break;
            }
        }
    }

    return {
        step: next,
        username: account?.username ?? "",
        finished,
        skipped,
        streamUrl: details.camera,
        steps: plan,
        details,
    };
}

export async function installerFinishCheck(): Promise<{ok: true} | {ok: false; message: string}> {
    const progress = await readInstallerProgress();
    return installerCanFinish(progress);
}
