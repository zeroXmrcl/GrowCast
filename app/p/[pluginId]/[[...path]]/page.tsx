import {notFound} from "next/navigation";
import PluginMount from "@/components/plugin-mount";
import {isAdminAuthenticated} from "@/lib/admin-auth";
import {getCurrentGrow} from "@/lib/db";
import {findDiscoveredPlugin} from "@/lib/plugins/discovery";
import {loadHostModule} from "@/lib/plugins/first-party";
import {getRegistryRecord, pluginMayExecute} from "@/lib/plugins/registry";
import {resolvePluginPage} from "@/lib/plugins/routes";

export const dynamic = "force-dynamic";

function growPageData(grow: Awaited<ReturnType<typeof getCurrentGrow>>, captureToken?: string) {
    return {
        plant: grow.plant,
        name: grow.name,
        seededAt: grow.details.seededAt,
        overlayLayout: grow.overlayLayout,
        overlayScalePct: grow.overlayScalePct,
        climateTick: grow.climateTick,
        devicesDesign: grow.devicesDesign,
        streamUrl: grow.streamUrl,
        stage: grow.details.stage,
        lightSchedule: grow.details.lightSchedule,
        strain: grow.details.strain,
        ...(captureToken ? {captureToken} : {}),
    };
}

export default async function PluginSitePage({
    params,
    searchParams,
}: {
    params: Promise<{pluginId: string; path?: string[]}>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const {pluginId, path} = await params;
    const resolved = await resolvePluginPage(pluginId, path, "site");
    if (!resolved) {
        notFound();
    }
    const discovered = await findDiscoveredPlugin(resolved.pluginId);
    const record = await getRegistryRecord(resolved.pluginId);
    if (!discovered || !record || !pluginMayExecute(record)) {
        notFound();
    }
    const admin = await isAdminAuthenticated();
    const query = await searchParams;
    if (!resolved.public && !admin) {
        const host = await loadHostModule(discovered, record.currentHash);
        const allowed = host?.authorizePage
            ? await host.authorizePage({pageId: resolved.page.id, searchParams: query})
            : false;
        if (!allowed) {
            notFound();
        }
    }
    const broadcast = resolved.page.viewport === "broadcast";
    const grow = broadcast ? await getCurrentGrow() : null;
    const captureToken = typeof query.token === "string" ? query.token : undefined;
    return (
        <PluginMount
            pluginId={resolved.pluginId}
            version={resolved.assetVersion}
            entry={discovered.manifest.ui?.entry}
            webComponent={discovered.manifest.ui?.webComponent}
            styles={discovered.manifest.ui?.styles}
            pageId={resolved.page.id}
            role={admin ? "admin" : "visitor"}
            publicPage={resolved.public}
            pageData={grow ? growPageData(grow, captureToken) : undefined}
        />
    );
}
