"use client";

import {useState, type FormEvent} from "react";
import {saveProgramAudioAction} from "@/app/admin/actions";
import {AdminImmediateForm} from "@/app/admin/admin-save-form";
import {AdminButton, AdminField, AdminInput} from "@/components/admin/ui";
import {publishAdminNotice} from "@/lib/admin/publish-notice";
import type {RestreamAudio} from "@/lib/restream/audio";

export function MixerStrip({audio}: {audio: RestreamAudio}) {
    const [alertBusy, setAlertBusy] = useState(false);

    async function sendAlert(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();
        const form = event.currentTarget;
        const alertBody = String(new FormData(form).get("alertBody") ?? "");
        setAlertBusy(true);
        try {
            const response = await fetch("/api/admin/program-alert", {
                method: "POST",
                credentials: "include",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({alertBody}),
            });
            const raw: unknown = await response.json().catch(() => null);
            const ok = raw !== null && typeof raw === "object" && "ok" in raw && raw.ok === true;
            if (!response.ok || !ok) {
                publishAdminNotice({
                    title: "Alert",
                    body: "Could not send the alert.",
                    tone: "danger",
                });
                return;
            }
            form.reset();
            publishAdminNotice("alert_sent");
        } catch {
            publishAdminNotice({
                title: "Alert",
                body: "Could not send the alert.",
                tone: "danger",
            });
        } finally {
            setAlertBusy(false);
        }
    }

    return (
        <div className="space-y-3">
            <AdminImmediateForm action={saveProgramAudioAction} className="flex flex-wrap items-end gap-3">
                <label className="flex h-10 items-center gap-2 text-sm font-medium text-(--admin-text)">
                    <input
                        type="checkbox"
                        name="paused"
                        defaultChecked={audio.paused}
                        className="h-4 w-4 rounded border-(--admin-border-strong) bg-(--admin-surface) accent-zinc-300"
                    />
                    Paused
                </label>
                <div className="min-w-40 flex-1">
                    <AdminField label="Volume">
                        <input
                            type="range"
                            name="volume"
                            min={0}
                            max={1}
                            step={0.01}
                            defaultValue={audio.volume}
                            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-(--admin-border) accent-zinc-300"
                        />
                    </AdminField>
                </div>
                <AdminButton type="submit" tone="secondary">
                    Apply
                </AdminButton>
            </AdminImmediateForm>
            {audio.url ? (
                <p className="text-xs text-(--admin-muted)">{audio.url}</p>
            ) : null}
            <form onSubmit={sendAlert} className="flex flex-wrap items-end gap-3">
                <div className="min-w-48 flex-1">
                    <AdminField label="Alert">
                        <AdminInput
                            name="alertBody"
                            type="text"
                            autoComplete="off"
                            placeholder="Short message"
                        />
                    </AdminField>
                </div>
                <AdminButton type="submit" tone="primary" disabled={alertBusy}>
                    Send alert
                </AdminButton>
            </form>
        </div>
    );
}
