import {redirect} from "next/navigation";
import {AdminBand, AdminBandGroup} from "@/app/admin/admin-band";
import {AdminChrome, AdminSignOutButton, SETTINGS_SECTION_LINKS} from "@/app/admin/admin-chrome";
import {disablePluginAction, enablePluginAction} from "@/app/admin/plugins/actions";
import {isAdminAuthenticated} from "@/lib/admin-auth";
import {discoverPlugins} from "@/lib/plugins/discovery";
import {listRegistryRecords} from "@/lib/plugins/registry";
import {INSTALL_WARNING} from "@/lib/plugins/types";
import {pluginAdminNavItems} from "@/lib/plugins/nav";
import {readPluginConfig} from "@/lib/plugins/config";
import {PluginConfigForm} from "@/app/admin/plugins/config-form";

export const dynamic = "force-dynamic";

export default async function AdminPluginsPage() {
    if (!(await isAdminAuthenticated())) {
        redirect("/admin");
    }
    const [{plugins}, records, extra] = await Promise.all([
        discoverPlugins(),
        listRegistryRecords(),
        pluginAdminNavItems(),
    ]);
    const configs = await Promise.all(plugins.map(async (plugin) => ({
        id: plugin.manifest.id,
        values: await readPluginConfig(plugin.manifest.id),
    })));
    return (
        <AdminChrome
            title="Plugins"
            sections={[...SETTINGS_SECTION_LINKS, ...extra.map((item) => ({href: item.href, label: item.label}))]}
            actions={<AdminSignOutButton />}
        >
            <AdminBandGroup>
                <AdminBand id="trust" title="Trusted install">
                    <p className="text-sm text-(--admin-muted)">{INSTALL_WARNING}</p>
                    <p className="mt-2 text-sm text-(--admin-muted)">
                        Drop a folder into <code>plugins/</code>, review the SHA-256 hash, then enable.
                        GrowCast starts and stops the plugin backend. If files change after enable, the plugin is paused until you confirm the new hash.
                    </p>
                </AdminBand>
                {plugins.map((plugin) => {
                    const record = records.find((item) => item.id === plugin.manifest.id);
                    const config = configs.find((item) => item.id === plugin.manifest.id);
                    const enabled = record?.status === "enabled" || record?.status === "healthy";
                    const paused = record?.status === "paused";
                    return (
                        <AdminBand key={plugin.manifest.id} id={plugin.manifest.id} title={plugin.manifest.name}>
                            <dl className="grid gap-1 text-sm text-(--admin-text)">
                                <div>Id: {plugin.manifest.id}</div>
                                <div>Author: {plugin.manifest.author}</div>
                                <div>Version: {plugin.manifest.version} · API {plugin.manifest.apiVersion}</div>
                                <div>SDK: {plugin.manifest.ui?.sdk ?? "—"}</div>
                                {plugin.manifest.homepage ? <div>Homepage: {plugin.manifest.homepage}</div> : null}
                                {plugin.manifest.repository ? <div>Repository: {plugin.manifest.repository}</div> : null}
                                <div>Permissions: {plugin.manifest.permissions.network}
                                    {plugin.manifest.permissions.publicPages ? ", public pages" : ""}
                                    {plugin.manifest.permissions.media ? ", media" : ""}
                                </div>
                                <div>Status: {record?.status ?? "discovered"}</div>
                                <div className="break-all font-mono text-xs">SHA-256: {record?.currentHash || "—"}</div>
                                {record?.pinnedHash && record.pinnedHash !== record.currentHash ? (
                                    <div className="text-amber-400">
                                        Files changed since enable. Pinned {record.pinnedHash}. Confirm the new hash to resume.
                                    </div>
                                ) : null}
                            </dl>
                            <form action={enabled && !paused ? disablePluginAction : enablePluginAction} className="mt-4 space-y-3">
                                <input type="hidden" name="pluginId" value={plugin.manifest.id} />
                                {enabled && !paused ? null : (
                                    <label className="flex items-start gap-2 text-sm text-(--admin-muted)">
                                        <input type="checkbox" name="confirm" value="1" required />
                                        <span>I trust this plugin and accept that it runs code on this server and in browsers. Hash at enable: {record?.currentHash}</span>
                                    </label>
                                )}
                                <button type="submit" className="rounded-md border border-(--admin-border) px-3 py-1.5 text-sm">
                                    {paused ? "Confirm new hash and enable" : enabled ? "Disable" : "Enable"}
                                </button>
                            </form>
                            {enabled && !paused && config ? (
                                <PluginConfigForm
                                    pluginId={plugin.manifest.id}
                                    manifest={plugin.manifest}
                                    values={config.values}
                                />
                            ) : null}
                        </AdminBand>
                    );
                })}
                {plugins.length === 0 ? (
                    <AdminBand id="empty" title="No plugins">
                        <p className="text-sm text-(--admin-muted)">No plugin.json folders were found under plugins/.</p>
                    </AdminBand>
                ) : null}
            </AdminBandGroup>
        </AdminChrome>
    );
}
