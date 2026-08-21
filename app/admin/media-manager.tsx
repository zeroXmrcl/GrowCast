import {AdminButton, AdminField, AdminPanel} from "@/components/admin/ui";
import {
    listMediaFiles,
    MAX_UPLOAD_FILES,
    type MediaCollectionId,
    type MediaFile,
} from "@/lib/media-library";

type MediaAction = (formData: FormData) => Promise<void>;

type MediaManagerProps = {
    uploadAction: MediaAction;
    deleteAction: MediaAction;
};

type CollectionSectionProps = {
    collection: MediaCollectionId;
    title: string;
    description: string;
    files: MediaFile[];
    uploadAction: MediaAction;
    deleteAction: MediaAction;
};

function CollectionSection({
    collection,
    title,
    description,
    files,
    uploadAction,
    deleteAction,
}: CollectionSectionProps) {
    return (
        <div className="space-y-4">
            <div>
                <p className="text-sm font-semibold text-(--admin-text)">{title}</p>
                <p className="mt-1 text-xs text-(--admin-muted)">{description}</p>
            </div>

            <form action={uploadAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <input type="hidden" name="collection" value={collection}/>
                <div className="min-w-0 flex-1">
                    <AdminField
                        label="Add images"
                        hint={`JPEG, PNG or WebP. Up to ${MAX_UPLOAD_FILES} files, 15 MB each (40 MB total per upload). Converted to webp, metadata removed.`}
                    >
                        <input
                            type="file"
                            name="files"
                            multiple
                            required
                            accept="image/jpeg,image/png,image/webp"
                            className="block w-full text-sm text-(--admin-muted) file:mr-3 file:rounded-md file:border file:border-(--admin-border-strong) file:bg-(--admin-surface) file:px-3 file:py-2 file:text-sm file:font-medium file:text-(--admin-text) hover:file:bg-(--admin-surface-muted)"
                        />
                    </AdminField>
                </div>
                <AdminButton type="submit" tone="primary" className="shrink-0 sm:mb-6.5">
                    Upload
                </AdminButton>
            </form>

            {files.length === 0 ? (
                <p className="rounded-md border border-(--admin-border) bg-(--admin-surface) px-3 py-3 text-sm text-(--admin-muted)">
                    No images yet.
                </p>
            ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {files.map((file) => (
                        <div
                            key={file.name}
                            className="overflow-hidden rounded-md border border-(--admin-border) bg-(--admin-surface)"
                        >
                            <a href={file.url} target="_blank" rel="noreferrer">
                                <div className="aspect-video w-full overflow-hidden bg-black/30">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={file.url}
                                        alt={file.name}
                                        loading="lazy"
                                        className="h-full w-full object-cover"
                                    />
                                </div>
                            </a>
                            <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                                <span
                                    className="truncate text-xs text-(--admin-muted)"
                                    title={file.name}
                                >
                                    {file.name}
                                </span>
                                <form action={deleteAction} className="shrink-0">
                                    <input type="hidden" name="collection" value={collection}/>
                                    <input type="hidden" name="filename" value={file.name}/>
                                    <button
                                        type="submit"
                                        className="rounded border border-red-900/60 bg-red-950/40 px-2 py-1 text-xs font-medium text-red-200 hover:bg-red-900/50"
                                    >
                                        Delete
                                    </button>
                                </form>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default async function MediaManager({uploadAction, deleteAction}: MediaManagerProps) {
    const [dashboardFiles, setupFiles] = await Promise.all([
        listMediaFiles("dashboard"),
        listMediaFiles("setup"),
    ]);

    return (
        <AdminPanel
            id="pictures"
            title="Pictures"
            description="Manage the pictures shown on the public dashboard. Uploads are re-encoded to webp and stripped of metadata (including GPS)."
        >
            <div className="space-y-8">
                <CollectionSection
                    collection="dashboard"
                    title="Dashboard Pictures"
                    description="Shown in the picture strip on the dashboard. Moved to the archive when a grow is completed."
                    files={dashboardFiles}
                    uploadAction={uploadAction}
                    deleteAction={deleteAction}
                />
                <CollectionSection
                    collection="setup"
                    title="Setup Images"
                    description="Shown below the setup description on the dashboard."
                    files={setupFiles}
                    uploadAction={uploadAction}
                    deleteAction={deleteAction}
                />
            </div>
        </AdminPanel>
    );
}
