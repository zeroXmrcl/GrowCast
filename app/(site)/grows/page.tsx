import Link from "next/link";
import {getArchiveSnapshotFiles, listArchivedGrows, type ArchivedGrow} from "@/lib/archives";
import {formatDateDisplay, growDurationDays} from "./format";

export const dynamic = "force-dynamic";

type ArchiveCard = {
    archive: ArchivedGrow;
    thumbnailUrl: string | null;
};

async function loadArchiveCards(): Promise<ArchiveCard[]> {
    const archives = await listArchivedGrows();

    return Promise.all(
        archives.map(async (archive) => {
            const snapshotFiles = await getArchiveSnapshotFiles(archive.archiveId);
            const newest = snapshotFiles[0];

            return {
                archive,
                thumbnailUrl: newest
                    ? `/api/archives/${archive.archiveId}/snapshots/${encodeURIComponent(newest)}`
                    : null,
            };
        }),
    );
}

export default async function GrowsPage() {
    const cards = await loadArchiveCards();

    if (cards.length === 0) {
        return (
            <main className="min-h-screen bg-white px-6 py-10 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
                <div className="mx-auto max-w-5xl">
                    <h1 className="text-3xl font-bold tracking-tight">Past Grows</h1>
                    <p className="mt-3 max-w-2xl text-zinc-600 dark:text-zinc-300">
                        No grows have been archived yet. Once a grow is completed, it shows up
                        here with its details, snapshots and timelapse.
                    </p>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
            <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-10">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Past Grows</h1>
                    <p className="mt-2 text-zinc-600 dark:text-zinc-300">
                        {cards.length} completed {cards.length === 1 ? "grow" : "grows"}
                    </p>
                </div>

                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {cards.map(({archive, thumbnailUrl}) => {
                        const {grow, completion, media} = archive;
                        const duration = growDurationDays(
                            grow.details.seededAt,
                            completion.harvestedAt,
                        );
                        const subtitle = [grow.plant, grow.details.strain]
                            .filter(Boolean)
                            .join(" • ");

                        return (
                            <Link
                                key={archive.archiveId}
                                href={`/grows/${archive.archiveId}`}
                                className="group overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition hover:-translate-y-1 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
                            >
                                <div className="aspect-video w-full overflow-hidden bg-zinc-100 dark:bg-zinc-900">
                                    {thumbnailUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={thumbnailUrl}
                                            alt={grow.name}
                                            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                                            loading="lazy"
                                        />
                                    ) : (
                                        <div className="flex h-full w-full items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
                                            No snapshots
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-3 p-5">
                                    <div>
                                        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                                            {grow.name}
                                        </h2>
                                        {subtitle ? (
                                            <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                                                {subtitle}
                                            </p>
                                        ) : null}
                                    </div>

                                    <dl className="space-y-1.5 text-sm">
                                        <div className="flex justify-between gap-3">
                                            <dt className="text-zinc-500 dark:text-zinc-400">Harvested</dt>
                                            <dd className="text-right text-zinc-900 dark:text-zinc-100">
                                                {formatDateDisplay(completion.harvestedAt)}
                                            </dd>
                                        </div>
                                        {duration !== null ? (
                                            <div className="flex justify-between gap-3">
                                                <dt className="text-zinc-500 dark:text-zinc-400">Duration</dt>
                                                <dd className="text-right text-zinc-900 dark:text-zinc-100">
                                                    {duration} days
                                                </dd>
                                            </div>
                                        ) : null}
                                        {completion.yieldGrams !== null ? (
                                            <div className="flex justify-between gap-3">
                                                <dt className="text-zinc-500 dark:text-zinc-400">Yield</dt>
                                                <dd className="text-right text-zinc-900 dark:text-zinc-100">
                                                    {completion.yieldGrams} g
                                                </dd>
                                            </div>
                                        ) : null}
                                        <div className="flex justify-between gap-3">
                                            <dt className="text-zinc-500 dark:text-zinc-400">Snapshots</dt>
                                            <dd className="text-right text-zinc-900 dark:text-zinc-100">
                                                {media.snapshotCount}
                                            </dd>
                                        </div>
                                    </dl>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            </div>
        </main>
    );
}
