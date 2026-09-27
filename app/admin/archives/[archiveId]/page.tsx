import Link from "next/link";
import {redirect} from "next/navigation";
import {
    deleteArchiveAction,
    deleteArchiveMediaAction,
    updateArchiveAction,
} from "@/app/admin/archives/actions";
import {AdminBand, AdminBandGroup} from "@/app/admin/admin-band";
import {AdminImmediateForm, AdminSaveForm} from "@/app/admin/admin-save-form";
import {AdminChrome, AdminSignOutButton, SETTINGS_SECTION_LINKS} from "@/app/admin/admin-chrome";
import {
    AdminButton,
    AdminCheckboxRow,
    AdminField,
    AdminInput,
    AdminTextarea,
} from "@/components/admin/ui";
import {isAdminAuthenticated} from "@/lib/admin-auth";
import {withNotice} from "@/lib/admin/notice";
import {
    archiveMediaUrl,
    getArchivedGrow,
    getArchivePictureFiles,
    getArchiveSnapshotFiles,
    getArchiveTimelapseFile,
    type ArchiveMediaKind,
} from "@/lib/archives";

type ArchiveEditorPageProps = {
    params: Promise<{archiveId: string}>;
    searchParams: Promise<{
        notice?: string;
    }>;
};

type MediaDeleteGridProps = {
    archiveId: string;
    kind: ArchiveMediaKind;
    title: string;
    files: Array<{name: string; url: string}>;
};

function MediaDeleteGrid({archiveId, kind, title, files}: MediaDeleteGridProps) {
    if (files.length === 0) {
        return null;
    }

    return (
        <AdminImmediateForm action={deleteArchiveMediaAction}>
            <AdminBand id={kind} title={title}>
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
                <AdminButton type="submit" tone="danger" className="mt-4">
                    Delete selected
                </AdminButton>
            </AdminBand>
        </AdminImmediateForm>
    );
}

export default async function ArchiveEditorPage({params}: ArchiveEditorPageProps) {
    const {archiveId} = await params;

    if (!(await isAdminAuthenticated())) {
        redirect("/admin");
    }

    const archive = await getArchivedGrow(archiveId);
    if (!archive) {
        redirect(withNotice("/admin/archives", "archive_not_found"));
    }

    const [snapshotFiles, pictureFiles, timelapseFile] = await Promise.all([
        getArchiveSnapshotFiles(archiveId),
        getArchivePictureFiles(archiveId),
        getArchiveTimelapseFile(archiveId),
    ]);

    const snapshots = snapshotFiles.map((name) => ({
        name,
        url: archiveMediaUrl(archiveId, "snapshots", name),
    }));
    const pictures = pictureFiles.map((name) => ({
        name,
        url: archiveMediaUrl(archiveId, "pictures", name),
    }));

    const {grow, completion} = archive;

    return (
        <AdminChrome
            title={grow.name}
            sections={SETTINGS_SECTION_LINKS}
            eyebrow={
                <Link
                    href="/admin/archives"
                    className="text-xs text-(--admin-muted) hover:text-(--admin-text)"
                >
                    &larr; Archived Grows
                </Link>
            }
            actions={
                <div className="flex items-center gap-3">
                    <Link
                        href={`/grows/${archiveId}`}
                        target="_blank"
                        className="shrink-0 text-sm text-(--admin-muted) hover:text-(--admin-text)"
                    >
                        View public page
                    </Link>
                    <AdminSignOutButton/>
                </div>
            }
        >
            <AdminBandGroup>
                <AdminSaveForm action={updateArchiveAction}>
                    <AdminBand id="details" title="Details">
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
                            <AdminField label="Yield (grams)">
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
                    </AdminBand>
                </AdminSaveForm>

                <MediaDeleteGrid
                    archiveId={archiveId}
                    kind="snapshots"
                    title="Snapshots"
                    files={snapshots}
                />

                <MediaDeleteGrid
                    archiveId={archiveId}
                    kind="pictures"
                    title="Pictures"
                    files={pictures}
                />

                {timelapseFile ? (
                    <AdminImmediateForm action={deleteArchiveMediaAction}>
                        <AdminBand id="timelapse" title="Timelapse">
                            <input type="hidden" name="archiveId" value={archiveId}/>
                            <input type="hidden" name="kind" value="timelapse"/>
                            <input type="hidden" name="filenames" value={timelapseFile}/>
                            <p className="mb-3 text-sm text-(--admin-text)">{timelapseFile}</p>
                            <video
                                controls
                                preload="metadata"
                                className="w-full rounded-md border border-(--admin-border) bg-black"
                            >
                                <source
                                    src={archiveMediaUrl(archiveId, "timelapse", timelapseFile)}
                                    type="video/mp4"
                                />
                            </video>
                            <AdminButton type="submit" tone="danger" className="mt-4">
                                Delete timelapse
                            </AdminButton>
                        </AdminBand>
                    </AdminImmediateForm>
                ) : null}

                <form action={deleteArchiveAction}>
                    <AdminBand id="danger" title="Danger Zone">
                        <input type="hidden" name="archiveId" value={archiveId}/>
                        <div className="space-y-4">
                            <AdminCheckboxRow
                                name="confirmDelete"
                                required
                                label="I understand this permanently deletes the archive"
                            />
                            <AdminButton type="submit" tone="danger">
                                Delete Entire Archive
                            </AdminButton>
                        </div>
                    </AdminBand>
                </form>
            </AdminBandGroup>
        </AdminChrome>
    );
}
