import {saveAlertsSettingsAction} from "@/app/admin/actions";
import {AdminBand} from "@/app/admin/admin-band";
import {AdminImmediateForm} from "@/app/admin/admin-save-form";
import {AdminButton, AdminCheckboxRow} from "@/components/admin/ui";
import OverlayScaleInput from "@/components/overlay-scale-input";
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
        <AdminBand id="alerts" title="Alerts">
            <div className="mb-4 flex items-center justify-between gap-3">
                {connected ? (
                    <p className="text-sm text-(--admin-muted)">{`Connected as ${twitchLogin}`}</p>
                ) : <span/>}
                <a
                    href="/admin/stream/twitch-connect"
                    className="inline-flex h-10 items-center justify-center rounded-md border border-(--admin-border-strong) bg-(--admin-surface) px-4 text-sm font-medium text-(--admin-text) hover:border-zinc-500 hover:bg-(--admin-surface-muted)"
                >
                    Connect Twitch
                </a>
            </div>
            <AdminImmediateForm action={saveAlertsSettingsAction} className="space-y-3">
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
                <OverlayScaleInput
                    defaultValue={settings.alertScalePct}
                    name="alertScalePct"
                    label="Alert scale"
                />
                <AdminButton type="submit" tone="secondary">
                    Save
                </AdminButton>
            </AdminImmediateForm>
        </AdminBand>
    );
}
