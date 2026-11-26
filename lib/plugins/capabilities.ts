import {findDiscoveredPlugin} from "@/lib/plugins/discovery";
import {listRegistryRecords, pluginIsActive} from "@/lib/plugins/registry";
import type {PluginExports} from "@/lib/plugins/types";

export async function pluginIdForExport(key: keyof PluginExports): Promise<string | null> {
    const records = await listRegistryRecords();
    for (const record of records) {
        if (!pluginIsActive(record)) {
            continue;
        }
        const discovered = await findDiscoveredPlugin(record.id);
        if (discovered?.manifest.exports?.[key]) {
            return record.id;
        }
    }
    return null;
}

export async function pluginExportEnabled(key: keyof PluginExports): Promise<boolean> {
    return (await pluginIdForExport(key)) !== null;
}
