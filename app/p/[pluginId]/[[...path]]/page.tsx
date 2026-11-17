import {notFound} from "next/navigation";
import PluginMount from "@/components/plugin-mount";
import {isAdminAuthenticated} from "@/lib/admin-auth";
import {findDiscoveredPlugin} from "@/lib/plugins/discovery";
import {loadFirstPartyServerPage} from "@/lib/plugins/server-pages";
import {resolvePluginPage} from "@/lib/plugins/routes";

export const dynamic = "force-dynamic";

export default async function PluginSitePage({
    params,
    searchParams,
}: {
    params: Promise<{pluginId: string; path?: string[]}>;
    searchParams: Promise<{token?: string}>;
}) {
    const {pluginId, path} = await params;
    const resolved = await resolvePluginPage(pluginId, path, "site");
    if (!resolved) {
        notFound();
    }
    if (!resolved.public && !(await isAdminAuthenticated())) {
        notFound();
    }
    const discovered = await findDiscoveredPlugin(resolved.pluginId);
    if (!discovered) {
        notFound();
    }
    const ServerPage = await loadFirstPartyServerPage(resolved.pluginId, resolved.page.id);
    if (ServerPage) {
        return <ServerPage searchParams={searchParams} />;
    }
    return (
        <PluginMount
            pluginId={resolved.pluginId}
            version={discovered.manifest.version}
            entry={discovered.manifest.ui?.entry}
            webComponent={discovered.manifest.ui?.webComponent}
            styles={discovered.manifest.ui?.styles}
            pageId={resolved.page.id}
            role={(await isAdminAuthenticated()) ? "admin" : "visitor"}
            publicPage={resolved.public}
        />
    );
}
