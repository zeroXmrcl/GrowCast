import type {ComponentType} from "react";

type ServerPageProps = {
    searchParams?: Promise<{token?: string}>;
};

type PageModule = {default: ComponentType<ServerPageProps>};

/** Server-only first-party pages. Widget UI is built to plugins/<id>/ui/dist. */
const FIRST_PARTY_SERVER_PAGES: Record<string, () => Promise<PageModule>> = {
    "growcast.ggs:admin": () => import("@/plugins/ggs/admin/page"),
    "growcast.ggs:energy": () => import("@/plugins/ggs/pages/energy"),
    "growcast.timelapse:admin": () => import("@/plugins/timelapse/admin/page"),
    "growcast.timelapse:gallery": () => import("@/plugins/timelapse/pages/gallery"),
    "growcast.restream:admin": () => import("@/plugins/restream/admin/page"),
    "growcast.restream:capture": () => import("@/plugins/restream/pages/capture"),
    "growcast.restream:program": () => import("@/plugins/restream/pages/program"),
};

export async function loadFirstPartyServerPage(
    pluginId: string,
    pageId: string,
): Promise<ComponentType<ServerPageProps> | null> {
    const loader = FIRST_PARTY_SERVER_PAGES[`${pluginId}:${pageId}`];
    if (!loader) {
        return null;
    }
    try {
        const mod = await loader();
        return mod.default;
    } catch {
        return null;
    }
}
