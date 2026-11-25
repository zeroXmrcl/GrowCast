"use server";

import {revalidatePath} from "next/cache";
import {isAdminAuthenticated} from "@/lib/admin-auth";
import {writePluginConfig} from "@/lib/plugins/config";
import {findDiscoveredPlugin} from "@/lib/plugins/discovery";
import {disablePlugin, enablePlugin, installPlugin} from "@/lib/plugins/registry";
import {startPluginRuntime, stopPluginRuntime, syncPluginRuntimes} from "@/lib/plugins/runtime";

async function requireAdmin(): Promise<void> {
    if (!(await isAdminAuthenticated())) {
        throw new Error("Unauthorized");
    }
}

export async function enablePluginAction(formData: FormData): Promise<void> {
    await requireAdmin();
    const pluginId = String(formData.get("pluginId") ?? "");
    const confirmed = String(formData.get("confirm") ?? "") === "1";
    if (!pluginId || !confirmed) {
        throw new Error("Enable requires an explicit trust confirmation");
    }
    const discovered = await findDiscoveredPlugin(pluginId);
    if (!discovered) {
        throw new Error("Unknown plugin");
    }
    await installPlugin(pluginId);
    await enablePlugin(pluginId);
    await startPluginRuntime(pluginId);
    await syncPluginRuntimes();
    revalidatePath("/admin/plugins");
}

export async function disablePluginAction(formData: FormData): Promise<void> {
    await requireAdmin();
    const pluginId = String(formData.get("pluginId") ?? "");
    await disablePlugin(pluginId);
    await stopPluginRuntime(pluginId);
    await syncPluginRuntimes();
    revalidatePath("/admin/plugins");
}

export async function savePluginConfigAction(formData: FormData): Promise<void> {
    await requireAdmin();
    const pluginId = String(formData.get("pluginId") ?? "");
    const discovered = await findDiscoveredPlugin(pluginId);
    if (!discovered) {
        throw new Error("Unknown plugin");
    }
    const values: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(discovered.manifest.config)) {
        if (field.type === "boolean") {
            values[key] = String(formData.get(key) ?? "") === "true";
            continue;
        }
        const raw = formData.get(key);
        if (raw !== null) {
            values[key] = String(raw);
        }
    }
    await writePluginConfig(pluginId, discovered.manifest, values);
    await startPluginRuntime(pluginId);
    await syncPluginRuntimes();
    revalidatePath("/admin/plugins");
}
