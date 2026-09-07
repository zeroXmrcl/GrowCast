import Link from "next/link";
import {saveAlertsSettingsAction} from "@/app/admin/actions";
import {AdminButton, AdminCheckboxRow, AdminPanel} from "@/components/admin/ui";
import type {AlertsSettings} from "@/lib/restream/alerts-settings";

export function AlertsPanel({
    settings,
    twitchLogin = "",
}: {
    settings: AlertsSettings;
    twitchLogin?: string;
}) {
    const connected = twitchLogin.trim().length > 0;
    return (
        <AdminPanel
            id="alerts"
            title="Alerts"
            description={connected ? `Connected as ${twitchLogin}` : undefined}
            actions={
                <Link
                    href="/admin/stream/twitch-connect"
                    className="inline-flex h-10 items-center justify-center rounded-md border border-(--admin-border-strong) bg-(--admin-surface) px-4 text-sm font-medium text-(--admin-text) hover:border-zinc-500 hover:bg-(--admin-surface-muted)"
                >
                    Connect Twitch
                </Link>
            }
        >
            <form action={saveAlertsSettingsAction} className="space-y-3">
                {!connected && settings.follow ? <input type="hidden" name="follow" value="on"/> : null}
                <AdminCheckboxRow
                    name="follow"
                    label="Follow"
                    defaultChecked={settings.follow}
                    disabled={!connected}
                />
                {!connected && settings.sub ? <input type="hidden" name="sub" value="on"/> : null}
                <AdminCheckboxRow
                    name="sub"
                    label="Sub"
                    defaultChecked={settings.sub}
                    disabled={!connected}
                />
                {!connected && settings.raid ? <input type="hidden" name="raid" value="on"/> : null}
                <AdminCheckboxRow
                    name="raid"
                    label="Raid"
                    defaultChecked={settings.raid}
                    disabled={!connected}
                />
                {!connected && settings.bits ? <input type="hidden" name="bits" value="on"/> : null}
                <AdminCheckboxRow
                    name="bits"
                    label="Bits"
                    defaultChecked={settings.bits}
                    disabled={!connected}
                />
                <AdminCheckboxRow
                    name="stingEnabled"
                    label="Alert sound"
                    defaultChecked={settings.stingEnabled}
                />
                <AdminButton type="submit" tone="secondary">
                    Save
                </AdminButton>
            </form>
        </AdminPanel>
    );
}
