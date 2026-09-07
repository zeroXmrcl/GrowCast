import {saveProgramAudioUrlAction} from "@/app/admin/actions";
import {AdminButton, AdminField, AdminInput, AdminPanel} from "@/components/admin/ui";
import WaveSmoothInput from "@/components/wave-smooth-input";

const MUSIC_ENDPOINT = "/api/admin/music";

export function MusicPanel({
    files,
    url,
    waveSmoothPct,
}: {
    files: string[];
    url: string;
    waveSmoothPct: number;
}) {
    return (
        <AdminPanel id="music" title="Music">
            <div className="space-y-4">
                <form action={saveProgramAudioUrlAction} className="space-y-3">
                    <AdminField
                        label="Stream URL"
                        hint="URL wins while set. Clear it to loop uploaded tracks."
                    >
                        <AdminInput
                            name="url"
                            type="url"
                            defaultValue={url}
                            autoComplete="off"
                            placeholder="https://"
                        />
                    </AdminField>
                    <WaveSmoothInput defaultValue={waveSmoothPct} />
                    <AdminButton type="submit" tone="secondary">
                        Save URL
                    </AdminButton>
                </form>

                <form
                    action={MUSIC_ENDPOINT}
                    method="post"
                    encType="multipart/form-data"
                    className="flex flex-col gap-3"
                >
                    <input type="hidden" name="intent" value="upload"/>
                    <AdminField
                        label="Upload track"
                        hint="mp3, ogg, wav, or m4a. Up to 20 MB each, 30 files."
                    >
                        <input
                            type="file"
                            name="file"
                            required
                            accept=".mp3,.ogg,.wav,.m4a"
                            className="block w-full text-sm text-(--admin-muted) file:mr-3 file:rounded-md file:border file:border-(--admin-border-strong) file:bg-(--admin-surface) file:px-3 file:py-2 file:text-sm file:font-medium file:text-(--admin-text) hover:file:bg-(--admin-surface-muted)"
                        />
                    </AdminField>
                    <AdminButton type="submit" tone="primary">
                        Upload
                    </AdminButton>
                </form>

                {files.length === 0 ? (
                    <p className="rounded-md border border-(--admin-border) bg-(--admin-surface) px-3 py-3 text-sm text-(--admin-muted)">
                        No tracks yet.
                    </p>
                ) : (
                    <ul className="space-y-2">
                        {files.map((filename) => (
                            <li
                                key={filename}
                                className="flex items-center justify-between gap-2 rounded-md border border-(--admin-border) bg-(--admin-surface) px-3 py-2"
                            >
                                <span className="truncate text-sm text-(--admin-text)" title={filename}>
                                    {filename}
                                </span>
                                <form action={MUSIC_ENDPOINT} method="post">
                                    <input type="hidden" name="intent" value="delete"/>
                                    <input type="hidden" name="filename" value={filename}/>
                                    <button
                                        type="submit"
                                        className="rounded border border-red-900/60 bg-red-950/40 px-2 py-1 text-xs font-medium text-red-200 hover:bg-red-900/50"
                                    >
                                        Delete
                                    </button>
                                </form>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </AdminPanel>
    );
}
