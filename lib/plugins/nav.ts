import {listEnabledAdminPages, listEnabledSitePages} from "@/lib/plugins/routes";
import {pluginUrlSlug} from "@/lib/plugins/ids";

export type PluginNavItem = {
    href: string;
    label: string;
    pluginId: string;
    bands?: Array<{id: string; label: string}>;
};

export async function pluginSiteNavItems(): Promise<PluginNavItem[]> {
    const pages = await listEnabledSitePages();
    return pages.map((item) => ({
        pluginId: item.pluginId,
        label: item.page.title,
        href: `/p/${pluginUrlSlug(item.pluginId)}${item.page.path ? `/${item.page.path}` : ""}`,
    }));
}

export async function pluginAdminNavItems(): Promise<PluginNavItem[]> {
    const pages = await listEnabledAdminPages();
    const items: PluginNavItem[] = [{href: "/admin/plugins", label: "Plugins", pluginId: "host"}];
    for (const item of pages) {
        items.push({
            pluginId: item.pluginId,
            label: item.page.title,
            href: `/admin/plugins/${item.pluginId}${item.page.path ? `/${item.page.path}` : ""}`,
            bands: item.page.bands,
        });
    }
    return items;
}

export function pluginPublicBasePath(pluginId: string): string {
    return `/p/${pluginUrlSlug(pluginId)}`;
}
