import {BroadcastToastSwitch} from "@/app/admin/broadcast-toast-switch";
import {AdminBand} from "@/app/admin/admin-band";
import {AdminImmediateForm} from "@/app/admin/admin-save-form";
import {AdminButton, AdminField, AdminInput} from "@/components/admin/ui";
import type {AdminActionResult} from "@/lib/admin/action-result";
import type {RestreamPublicView} from "@/lib/restream/store";

type RestreamAction = (formData: FormData) => Promise<AdminActionResult>;

export function RestreamPanel({
    view,
    startAction,
    stopAction,
    saveToastAction,
    saveKeyAction,
}: {
    view: RestreamPublicView;
    startAction: RestreamAction;
    stopAction: RestreamAction;
    saveToastAction: RestreamAction;
    saveKeyAction: RestreamAction;
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
                    <AdminImmediateForm action={startAction}>
                        <AdminButton type="submit" tone="primary">
                            Start
                        </AdminButton>
                    </AdminImmediateForm>
                    <AdminImmediateForm action={stopAction}>
                        <AdminButton type="submit" tone="secondary">
                            Stop
                        </AdminButton>
                    </AdminImmediateForm>
                </div>
                <AdminImmediateForm action={saveToastAction}>
                    <BroadcastToastSwitch defaultChecked={view.toastEnabled}/>
                </AdminImmediateForm>
                <AdminImmediateForm action={saveKeyAction} className="space-y-3">
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
                </AdminImmediateForm>
            </div>
        </AdminBand>
    );
}
