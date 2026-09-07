import {saveProgramAudioAction, sendProgramAlertAction} from "@/app/admin/actions";
import {AdminButton, AdminField, AdminInput} from "@/components/admin/ui";
import type {RestreamAudio} from "@/lib/restream/audio";

export function MixerStrip({audio}: {audio: RestreamAudio}) {
    return (
        <div className="mt-3 space-y-3 rounded-md border border-(--admin-border) bg-(--admin-surface-muted) px-4 py-3">
            <form action={saveProgramAudioAction} className="flex flex-wrap items-end gap-3">
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
            </form>
            {audio.url ? (
                <p className="text-xs text-(--admin-muted)">{audio.url}</p>
            ) : null}
            <form action={sendProgramAlertAction} className="flex flex-wrap items-end gap-3">
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
                <AdminButton type="submit" tone="primary">
                    Send alert
                </AdminButton>
            </form>
        </div>
    );
}
