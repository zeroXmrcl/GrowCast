import { getSnapshotFiles } from "@/lib/extension-status";

export type SnapshotItem = {
    name: string;
    url: string;
};

type SnapshotGalleryProps = {
    /** Explicit snapshot list (archived grows); `undefined` falls back to the live snapshot folder. */
    snapshots?: SnapshotItem[];
};

async function loadLiveSnapshots(): Promise<SnapshotItem[]> {
    const files = await getSnapshotFiles();

    return files.map((name) => ({
        name,
        url: `/api/snapshots/${encodeURIComponent(name)}`,
    }));
}

export default async function SnapshotGallery({ snapshots }: SnapshotGalleryProps = {}) {
    const resolved = snapshots ?? (await loadLiveSnapshots());

    if (resolved.length === 0) {
        return (
            <section className="border-t border-zinc-200 p-4 pt-15 dark:border-zinc-800">
                <h2 className="font-medium text-zinc-900 dark:text-zinc-100">
                    Snapshots
                </h2>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    No snapshots taken yet.
                </p>
            </section>
        );
    }

    return (
        <section className="space-y-6">
            <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                    Snapshots
                </h2>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    {resolved.length} images available
                </p>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {resolved.map((snapshot) => (
                    <a
                        key={snapshot.name}
                        href={snapshot.url}
                        target="_blank"
                        rel="noreferrer"
                        className="group overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition hover:-translate-y-1 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
                    >
                        <div className="aspect-video w-full overflow-hidden bg-zinc-100 dark:bg-zinc-900">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={snapshot.url}
                                alt={snapshot.name}
                                className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                                loading="lazy"
                            />
                        </div>
                    </a>
                ))}
            </div>
        </section>
    );
}
