import {headers} from "next/headers";
import {notFound, redirect} from "next/navigation";
import PluginMount from "@/components/plugin-mount";
import {regenerateAiSummaryAction, saveGrowAction} from "@/app/admin/actions";
import {AiSummaryPanel} from "@/app/admin/ai-summary-panel";
import {AdminSaveForm} from "@/app/admin/admin-save-form";
import {AdminChrome, AdminSignOutButton, SETTINGS_SECTION_LINKS} from "@/app/admin/admin-chrome";
import {StreamSettingsFields} from "@/app/admin/overlay-fields";
import {aiSummaryDemoMode, hasXaiApiKey} from "@/lib/ai-summary/config";
import {readStoredAiSummaryPublic} from "@/lib/ai-summary/public";
import {isAdminAuthenticated} from "@/lib/admin-auth";
import {getCurrentGrow} from "@/lib/db";
import {overlayPublicUrl} from "@/lib/overlay-layout";
import {pluginAdminShowsAiSummary, pluginAdminShowsStreamSettings} from "@/lib/plugins/admin-host-extras";
import {findDiscoveredPlugin} from "@/lib/plugins/discovery";
import {pluginAdminNavItems} from "@/lib/plugins/nav";
import {resolvePluginPage} from "@/lib/plugins/routes";
import {shareCardMetadataOrigin} from "@/lib/share-card";

export const dynamic = "force-dynamic";

export default async function PluginAdminPage({
    params,
}: {
    params: Promise<{pluginId: string; path?: string[]}>;
}) {
    if (!(await isAdminAuthenticated())) {
        redirect("/admin");
    }
    const {pluginId, path} = await params;
    const resolved = await resolvePluginPage(pluginId, path, "admin");
    if (!resolved) {
        notFound();
    }
    const discovered = await findDiscoveredPlugin(resolved.pluginId);
    if (!discovered) {
        notFound();
    }
    const extra = await pluginAdminNavItems();
    const showStream = pluginAdminShowsStreamSettings(discovered.manifest);
    const showAi = pluginAdminShowsAiSummary(discovered.manifest);
    const [grow, overlayUrl, aiSummary] = await Promise.all([
        showStream ? getCurrentGrow() : Promise.resolve(null),
        showStream
            ? Promise.resolve(overlayPublicUrl(shareCardMetadataOrigin(await headers())))
            : Promise.resolve(""),
        showAi ? readStoredAiSummaryPublic() : Promise.resolve(null),
    ]);

    return (
        <AdminChrome
            title={resolved.page.title}
            sections={[...SETTINGS_SECTION_LINKS, ...extra.map((item) => ({href: item.href, label: item.label}))]}
            actions={<AdminSignOutButton />}
        >
            {showStream && grow ? (
                <AdminSaveForm action={saveGrowAction}>
                    <input type="hidden" name="growId" value={grow.id} />
                    <StreamSettingsFields grow={grow} overlayUrl={overlayUrl} />
                </AdminSaveForm>
            ) : null}
            <PluginMount
                pluginId={resolved.pluginId}
                version={resolved.assetVersion}
                entry={discovered.manifest.ui?.entry}
                webComponent={discovered.manifest.ui?.webComponent}
                styles={discovered.manifest.ui?.styles}
                pageId={resolved.page.id}
                role="admin"
                publicPage={false}
            />
            {showAi ? (
                <AiSummaryPanel
                    configured={hasXaiApiKey()}
                    demoMode={aiSummaryDemoMode()}
                    summary={aiSummary}
                    regenerateAction={regenerateAiSummaryAction}
                />
            ) : null}
        </AdminChrome>
    );
}
