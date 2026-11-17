import {BroadcastToastSwitch} from "@/plugins/restream/admin/broadcast-toast-switch";
import {AdminBand, AdminButton, AdminField, AdminInput, PluginImmediateForm} from "@/lib/plugins/admin-kit";
import type {RestreamPublicView} from "@/plugins/restream/host/store";

export function RestreamPanel({
    view,
}: {
    view: RestreamPublicView;
}) {
    const status = view.status.state;
    const statusLabel =
        status === "live"
            ? "LIVE"
            : status === "starting"
              ? "Starting"
              : status === "reconnecting"
                ? "Reconnecting"
                : status === "error"
                  ? "Error"
                  : "OFF";

    return (
        <AdminBand id="twitch" title="Twitch">
            <div className="space-y-4">
                <p className="text-sm text-(--admin-muted)">
                    Status: <span className="font-medium text-(--admin-text)">{statusLabel}</span>
                    {view.status.lastError ? ` — ${view.status.lastError}` : ""}
                    {view.hasKey ? "" : " — no stream key saved"}
                </p>
                <div className="flex flex-wrap gap-2">
                    <PluginImmediateForm actionPath="twitch-start">
                        <AdminButton type="submit" tone="primary">
                            Start
                        </AdminButton>
                    </PluginImmediateForm>
                    <PluginImmediateForm actionPath="twitch-stop">
                        <AdminButton type="submit" tone="secondary">
                            Stop
                        </AdminButton>
                    </PluginImmediateForm>
                </div>
                <PluginImmediateForm actionPath="twitch-toast">
                    <BroadcastToastSwitch defaultChecked={view.toastEnabled}/>
                </PluginImmediateForm>
                <PluginImmediateForm actionPath="twitch-key" className="space-y-3">
                    <AdminField label="Stream key">
                        <AdminInput
                            type="password"
                            name="twitchKey"
                            autoComplete="off"
                            placeholder={view.hasKey ? "Key saved — leave blank to keep" : "live_…"}
                        />
                    </AdminField>
                    <AdminField label="Twitch channel">
                        <AdminInput
                            name="twitchLogin"
                            defaultValue={view.login}
                            autoComplete="off"
                            placeholder="channel_login"
                        />
                    </AdminField>
                    <AdminButton type="submit" tone="secondary">
                        Save key
                    </AdminButton>
                </PluginImmediateForm>
            </div>
        </AdminBand>
    );
}
