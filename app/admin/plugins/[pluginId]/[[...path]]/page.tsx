import {notFound, redirect} from "next/navigation";
import PluginMount from "@/components/plugin-mount";
import {AdminChrome, AdminSignOutButton, SETTINGS_SECTION_LINKS} from "@/app/admin/admin-chrome";
import {isAdminAuthenticated} from "@/lib/admin-auth";
import {findDiscoveredPlugin} from "@/lib/plugins/discovery";
import {pluginAdminNavItems} from "@/lib/plugins/nav";
import {loadFirstPartyServerPage} from "@/lib/plugins/server-pages";
import {resolvePluginPage} from "@/lib/plugins/routes";

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
    const ServerPage = await loadFirstPartyServerPage(resolved.pluginId, resolved.page.id);
    return (
        <AdminChrome
            title={resolved.page.title}
            sections={[...SETTINGS_SECTION_LINKS, ...extra.map((item) => ({href: item.href, label: item.label}))]}
            actions={<AdminSignOutButton />}
        >
            {ServerPage ? (
                <ServerPage />
            ) : (
                <PluginMount
                    pluginId={resolved.pluginId}
                    version={discovered.manifest.version}
                    entry={discovered.manifest.ui?.entry}
                    webComponent={discovered.manifest.ui?.webComponent}
                    styles={discovered.manifest.ui?.styles}
                    pageId={resolved.page.id}
                    role="admin"
                    publicPage={false}
                />
            )}
        </AdminChrome>
    );
}
