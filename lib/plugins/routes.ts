import {discoverPlugins, findDiscoveredPlugin} from "@/lib/plugins/discovery";
import {pluginIdMatchesParam} from "@/lib/plugins/ids";
import {getRegistryRecord, listRegistryRecords, pluginIsActive} from "@/lib/plugins/registry";
import type {PluginPageSpec, PluginRegistryRecord, PluginWidgetSpec} from "@/lib/plugins/types";

export function isRoutablePlugin(record: PluginRegistryRecord | null): boolean {
    return pluginIsActive(record);
}

export type ResolvedPluginPage = {
    pluginId: string;
    folderName: string;
    page: PluginPageSpec;
    public: boolean;
};

export type ResolvedPluginWidget = {
    pluginId: string;
    widget: PluginWidgetSpec;
};

function normalizePath(value: string): string {
    return value.replace(/^\/+|\/+$/g, "");
}

export async function resolvePluginParam(param: string): Promise<string | null> {
    const {plugins} = await discoverPlugins();
    const match = plugins.find((item) => pluginIdMatchesParam(item.manifest.id, param));
    return match?.manifest.id ?? null;
}

export async function resolvePluginPage(
    pluginId: string,
    pathSegments: string[] | undefined,
    kind: "site" | "admin",
): Promise<ResolvedPluginPage | null> {
    const resolvedId = await resolvePluginParam(pluginId);
    if (!resolvedId) {
        return null;
    }
    const record = await getRegistryRecord(resolvedId);
    const discovered = await findDiscoveredPlugin(resolvedId);
    if (!discovered || !isRoutablePlugin(record)) {
        return null;
    }
    const remainder = normalizePath((pathSegments ?? []).join("/"));
    const wantedNav = kind === "admin" ? "admin" : "site";
    const page = discovered.manifest.pages.find((item) => {
        if (item.nav !== wantedNav && !(kind === "site" && item.nav === "none")) {
            return false;
        }
        return normalizePath(item.path) === remainder;
    }) ?? discovered.manifest.pages.find((item) => {
        if (item.nav !== wantedNav) {
            return false;
        }
        return remainder === "" && normalizePath(item.path) === "";
    });
    if (!page) {
        return null;
    }
    return {
        pluginId: resolvedId,
        folderName: discovered.folderName,
        page,
        public: page.public === true && discovered.manifest.permissions.publicPages === true,
    };
}

export async function listEnabledSitePages(): Promise<ResolvedPluginPage[]> {
    const records = await listRegistryRecords();
    const {plugins} = await discoverPlugins();
    const pages: ResolvedPluginPage[] = [];
    for (const plugin of plugins) {
        const record = records.find((item) => item.id === plugin.manifest.id);
        if (!isRoutablePlugin(record ?? null)) {
            continue;
        }
        for (const page of plugin.manifest.pages) {
            if (page.nav === "site") {
                pages.push({
                    pluginId: plugin.manifest.id,
                    folderName: plugin.folderName,
                    page,
                    public: page.public === true && plugin.manifest.permissions.publicPages === true,
                });
            }
        }
    }
    return pages;
}

export async function listEnabledAdminPages(): Promise<ResolvedPluginPage[]> {
    const records = await listRegistryRecords();
    const {plugins} = await discoverPlugins();
    const pages: ResolvedPluginPage[] = [];
    for (const plugin of plugins) {
        const record = records.find((item) => item.id === plugin.manifest.id);
        if (!isRoutablePlugin(record ?? null)) {
            continue;
        }
        for (const page of plugin.manifest.pages) {
            if (page.nav === "admin") {
                pages.push({
                    pluginId: plugin.manifest.id,
                    folderName: plugin.folderName,
                    page,
                    public: false,
                });
            }
        }
    }
    return pages;
}

export async function widgetsForSlot(slot: PluginWidgetSpec["slots"][number]): Promise<ResolvedPluginWidget[]> {
    const records = await listRegistryRecords();
    const {plugins} = await discoverPlugins();
    const widgets: ResolvedPluginWidget[] = [];
    for (const plugin of plugins) {
        const record = records.find((item) => item.id === plugin.manifest.id);
        if (!isRoutablePlugin(record ?? null)) {
            continue;
        }
        for (const widget of plugin.manifest.widgets) {
            if (widget.slots.includes(slot)) {
                widgets.push({pluginId: plugin.manifest.id, widget});
            }
        }
    }
    return widgets;
}
