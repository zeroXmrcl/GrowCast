import {BroadcastToastSwitch} from "@/app/admin/broadcast-toast-switch";
import {AdminButton, AdminField, AdminInput, AdminPanel} from "@/components/admin/ui";
import type {RestreamPublicView} from "@/lib/restream/store";

export function RestreamPanel({
    view,
    startAction,
    stopAction,
    saveToastAction,
    saveKeyAction,
}: {
    view: RestreamPublicView;
    startAction: (formData: FormData) => Promise<void>;
    stopAction: (formData: FormData) => Promise<void>;
    saveToastAction: (formData: FormData) => Promise<void>;
    saveKeyAction: (formData: FormData) => Promise<void>;
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
        <AdminPanel id="twitch" title="Twitch">
            <div className="space-y-4">
                <p className="text-sm text-(--admin-muted)">
                    Status: <span className="font-medium text-(--admin-text)">{statusLabel}</span>
                    {view.status.lastError ? ` — ${view.status.lastError}` : ""}
                    {view.hasKey ? "" : " — no stream key saved"}
                </p>
                <div className="flex flex-wrap gap-2">
                    <form action={startAction}>
                        <AdminButton type="submit" tone="primary">
                            Start
                        </AdminButton>
                    </form>
                    <form action={stopAction}>
                        <AdminButton type="submit" tone="secondary">
                            Stop
                        </AdminButton>
                    </form>
                </div>
                <form action={saveToastAction}>
                    <BroadcastToastSwitch defaultChecked={view.toastEnabled}/>
                </form>
                <form action={saveKeyAction} className="space-y-3">
                    <AdminField
                        label="Stream key"
                        hint="From Twitch Creator Dashboard → Stream."
                    >
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
                </form>
            </div>
        </AdminPanel>
    );
}
