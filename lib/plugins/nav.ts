import {listEnabledAdminPages, listEnabledSitePages} from "@/lib/plugins/routes";
import {pluginUrlSlug} from "@/lib/plugins/ids";
import type {PluginPageSpec} from "@/lib/plugins/types";

export type PluginNavItem = {
    href: string;
    label: string;
    pluginId: string;
    bands?: Array<{id: string; label: string}>;
};

export function siteNavOrder(page: PluginPageSpec): number {
    if (typeof page.navOrder === "number") {
        return page.navOrder;
    }
    if (page.path === "energy") {
        return 10;
    }
    if (page.path === "gallery") {
        return 30;
    }
    return 20;
}

export async function pluginSiteNavItems(): Promise<PluginNavItem[]> {
    const pages = await listEnabledSitePages();
    return pages
        .map((item) => ({
            pluginId: item.pluginId,
            label: item.page.title,
            href: `/p/${pluginUrlSlug(item.pluginId)}${item.page.path ? `/${item.page.path}` : ""}`,
            order: siteNavOrder(item.page),
        }))
        .sort((a, b) => a.order - b.order || a.pluginId.localeCompare(b.pluginId) || a.href.localeCompare(b.href))
        .map(({order: _order, ...item}) => item);
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
