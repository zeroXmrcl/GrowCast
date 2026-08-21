import Link from "next/link";
import {redirect} from "next/navigation";
import {
    deleteArchiveAction,
    deleteArchiveMediaAction,
    updateArchiveAction,
} from "@/app/admin/archives/actions";
import {
    AdminButton,
    AdminCheckboxRow,
    AdminField,
    AdminInput,
    AdminNotice,
    AdminPanel,
    AdminTextarea,
} from "@/components/admin/ui";
import {isAdminAuthenticated} from "@/lib/admin-auth";
import {
    getArchivedGrow,
    getArchivePictureFiles,
    getArchiveSnapshotFiles,
    getArchiveTimelapseFile,
    type ArchiveMediaKind,
} from "@/lib/archives";

type ArchiveEditorPageProps = {
    params: Promise<{archiveId: string}>;
    searchParams: Promise<{
        saved?: string;
        mediaDeleted?: string;
        error?: string;
    }>;
};

const ERROR_NOTICES: Record<string, {tone: "warning" | "danger"; title: string; body: string}> = {
    update_failed: {
        tone: "danger",
        title: "Update failed",
        body: "Could not save the archive details. Review logs and try again.",
    },
    media_delete_failed: {
        tone: "danger",
        title: "Delete failed",
        body: "Could not delete the selected files. Review logs and try again.",
    },
    delete_failed: {
        tone: "danger",
        title: "Delete failed",
        body: "Could not delete the archive. Review logs and try again.",
    },
    none_selected: {
        tone: "warning",
        title: "Nothing selected",
        body: "Tick at least one file to delete.",
    },
    not_confirmed: {
        tone: "warning",
        title: "Deletion not confirmed",
        body: "Tick the confirmation checkbox to delete the archive.",
    },
};

type MediaDeleteGridProps = {
    archiveId: string;
    kind: ArchiveMediaKind;
    title: string;
    description: string;
    files: Array<{name: string; url: string}>;
};

function MediaDeleteGrid({archiveId, kind, title, description, files}: MediaDeleteGridProps) {
    if (files.length === 0) {
        return null;
    }

    return (
        <form action={deleteArchiveMediaAction}>
            <AdminPanel
                title={`${title} (${files.length})`}
                description={description}
                actions={
                    <AdminButton type="submit" tone="danger">
                        Delete selected
                    </AdminButton>
                }
            >
                <input type="hidden" name="archiveId" value={archiveId}/>
                <input type="hidden" name="kind" value={kind}/>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {files.map((file) => (
                        <label
                            key={file.name}
                            className="group relative block cursor-pointer overflow-hidden rounded-md border border-(--admin-border) bg-(--admin-surface) transition hover:border-zinc-500"
                        >
                            <input
                                type="checkbox"
                                name="filenames"
                                value={file.name}
                                className="absolute left-2 top-2 z-10 h-4 w-4 rounded border-(--admin-border-strong) accent-zinc-300"
                            />
                            <div className="aspect-video w-full overflow-hidden bg-black/30">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={file.url}
                                    alt={file.name}
                                    loading="lazy"
                                    className="h-full w-full object-cover"
                                />
                            </div>
                            <span
                                className="block truncate px-2 py-1.5 text-xs text-(--admin-muted)"
                                title={file.name}
                            >
                                {file.name}
                            </span>
                        </label>
                    ))}
                </div>
            </AdminPanel>
        </form>
    );
}

export default async function ArchiveEditorPage({params, searchParams}: ArchiveEditorPageProps) {
    const [{archiveId}, query] = await Promise.all([params, searchParams]);

    if (!(await isAdminAuthenticated())) {
        redirect("/admin");
    }

    const archive = await getArchivedGrow(archiveId);
    if (!archive) {
        redirect("/admin/archives?error=not_found");
    }

    const [snapshotFiles, pictureFiles, timelapseFile] = await Promise.all([
        getArchiveSnapshotFiles(archiveId),
        getArchivePictureFiles(archiveId),
        getArchiveTimelapseFile(archiveId),
    ]);

    const snapshots = snapshotFiles.map((name) => ({
        name,
        url: `/api/archives/${archiveId}/snapshots/${encodeURIComponent(name)}`,
    }));
    const pictures = pictureFiles.map((name) => ({
        name,
        url: `/api/archives/${archiveId}/pictures/${encodeURIComponent(name)}`,
    }));

    const {grow, completion} = archive;
    const errorNotice = query.error ? ERROR_NOTICES[query.error] : undefined;
    const mediaDeletedCount = Number(query.mediaDeleted);

    return (
        <div className="admin-theme min-h-screen bg-(--admin-bg) px-4 py-8 text-(--admin-text) sm:px-6 lg:px-8">
            <div className="mx-auto max-w-4xl space-y-6">
                <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                        <Link
                            href="/admin/archives"
                            className="text-xs text-(--admin-muted) hover:text-(--admin-text)"
                        >
                            &larr; Archived Grows
                        </Link>
                        <h1 className="mt-1 truncate text-lg font-semibold text-(--admin-text)">
                            {grow.name}
                        </h1>
                    </div>
                    <Link
                        href={`/grows/${archiveId}`}
                        target="_blank"
                        className="shrink-0 text-sm text-(--admin-muted) hover:text-(--admin-text)"
                    >
                        View public page
                    </Link>
                </div>

                {query.saved ? (
                    <AdminNotice tone="success" title="Archive updated">
                        Done.
                    </AdminNotice>
                ) : null}

                {query.mediaDeleted ? (
                    <AdminNotice tone="success" title="Files deleted">
                        {Number.isFinite(mediaDeletedCount) && mediaDeletedCount > 0
                            ? `Deleted ${mediaDeletedCount} ${mediaDeletedCount === 1 ? "file" : "files"}.`
                            : "Done."}
                    </AdminNotice>
                ) : null}

                {errorNotice ? (
                    <AdminNotice tone={errorNotice.tone} title={errorNotice.title}>
                        {errorNotice.body}
                    </AdminNotice>
                ) : null}

                <form action={updateArchiveAction}>
                    <AdminPanel
                        title="Details"
                        description="Fix the archived grow's display information. The archive URL stays the same."
                        actions={
                            <AdminButton type="submit" tone="primary">
                                Save Changes
                            </AdminButton>
                        }
                    >
                        <input type="hidden" name="archiveId" value={archiveId}/>
                        <div className="grid gap-4 md:grid-cols-2">
                            <AdminField label="Grow Name">
                                <AdminInput name="name" defaultValue={grow.name} required/>
                            </AdminField>
                            <AdminField label="Plant">
                                <AdminInput name="plant" defaultValue={grow.plant}/>
                            </AdminField>
                            <AdminField label="Strain">
                                <AdminInput name="strain" defaultValue={grow.details.strain}/>
                            </AdminField>
                            <AdminField label="Yield (grams)" hint="Leave empty to clear.">
                                <AdminInput
                                    name="yieldGrams"
                                    type="number"
                                    min={0}
                                    step="0.1"
                                    defaultValue={completion.yieldGrams ?? ""}
                                />
                            </AdminField>
                            <AdminField label="Date of Seeding">
                                <AdminInput
                                    name="seededAt"
                                    type="date"
                                    defaultValue={grow.details.seededAt}
                                />
                            </AdminField>
                            <AdminField label="Harvest Date">
                                <AdminInput
                                    name="harvestedAt"
                                    type="date"
                                    defaultValue={completion.harvestedAt}
                                />
                            </AdminField>
                        </div>
                        <div className="mt-4">
                            <AdminField label="Final Notes">
                                <AdminTextarea
                                    name="finalNotes"
                                    defaultValue={completion.finalNotes}
                                    rows={4}
                                />
                            </AdminField>
                        </div>
                    </AdminPanel>
                </form>

                <MediaDeleteGrid
                    archiveId={archiveId}
                    kind="snapshots"
                    title="Snapshots"
                    description="Tick snapshots to remove them from the archive, then delete."
                    files={snapshots}
                />

                <MediaDeleteGrid
                    archiveId={archiveId}
                    kind="pictures"
                    title="Pictures"
                    description="Tick pictures to remove them from the archive, then delete."
                    files={pictures}
                />

                {timelapseFile ? (
                    <form action={deleteArchiveMediaAction}>
                        <AdminPanel
                            title="Timelapse"
                            description={timelapseFile}
                            actions={
                                <AdminButton type="submit" tone="danger">
                                    Delete timelapse
                                </AdminButton>
                            }
                        >
                            <input type="hidden" name="archiveId" value={archiveId}/>
                            <input type="hidden" name="kind" value="timelapse"/>
                            <input type="hidden" name="filenames" value={timelapseFile}/>
                            <video
                                controls
                                preload="metadata"
                                className="w-full rounded-md border border-(--admin-border) bg-black"
                            >
                                <source
                                    src={`/api/archives/${archiveId}/timelapse/${encodeURIComponent(timelapseFile)}`}
                                    type="video/mp4"
                                />
                            </video>
                        </AdminPanel>
                    </form>
                ) : null}

                <form action={deleteArchiveAction}>
                    <AdminPanel
                        title="Danger Zone"
                        description="Delete this archive permanently, including all media."
                        className="border-red-900/50"
                    >
                        <input type="hidden" name="archiveId" value={archiveId}/>
                        <div className="space-y-4">
                            <AdminCheckboxRow
                                name="confirmDelete"
                                required
                                label="I understand this permanently deletes the archive"
                                description="Details, snapshots, pictures and the timelapse are removed from disk. This cannot be undone."
                            />
                            <AdminButton type="submit" tone="danger">
                                Delete Entire Archive
                            </AdminButton>
                        </div>
                    </AdminPanel>
                </form>
            </div>
        </div>
    );
}
