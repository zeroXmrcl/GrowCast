import {AdminButton, AdminField, AdminInput, AdminPanel} from "@/components/admin/ui";
import type {RestreamPublicView} from "@/lib/restream/store";

export function RestreamPanel({
    view,
    saveKeyAction,
    startAction,
    stopAction,
}: {
    view: RestreamPublicView;
    saveKeyAction: (formData: FormData) => Promise<void>;
    startAction: (formData: FormData) => Promise<void>;
    stopAction: (formData: FormData) => Promise<void>;
}) {
    const status = view.status.state;
    const statusLabel =
        status === "live"
            ? "Live"
            : status === "starting"
              ? "Starting"
              : status === "reconnecting"
                ? "Reconnecting"
                : status === "error"
                  ? "Error"
                  : "Off";

    return (
        <AdminPanel
            id="twitch"
            title="Twitch 24/7"
            description="Pushes camera + overlay to Twitch from a sidecar. OBS Browser Source is unchanged."
        >
            <div className="space-y-4">
                <p className="text-sm text-(--admin-muted)">
                    Status: <span className="font-medium text-(--admin-text)">{statusLabel}</span>
                    {view.status.lastError ? ` — ${view.status.lastError}` : ""}
                    {view.hasKey ? "" : " — no stream key saved"}
                </p>
                <form action={saveKeyAction} className="space-y-3">
                    <AdminField
                        label="Stream key"
                        hint="From Twitch Creator Dashboard → Stream. Blank save keeps the current key."
                    >
                        <AdminInput
                            type="password"
                            name="twitchKey"
                            autoComplete="off"
                            placeholder={view.hasKey ? "Key saved — leave blank to keep" : "live_…"}
                        />
                    </AdminField>
                    <AdminButton type="submit" tone="secondary">
                        Save key
                    </AdminButton>
                </form>
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
            </div>
        </AdminPanel>
    );
}
