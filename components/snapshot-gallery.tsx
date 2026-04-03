import { getSnapshotFiles } from "@/lib/extension-status";

type SnapshotFile = {
    name: string;
    url: string;
};

async function loadSnapshots(): Promise<SnapshotFile[]> {
    const files = await getSnapshotFiles();

    return files.map((name) => ({
        name,
        url: `/api/snapshots/${encodeURIComponent(name)}`,
    }));
}

export default async function SnapshotGallery() {
    const snapshots = await loadSnapshots();

    if (snapshots.length === 0) {
        return (
            <section className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-6 shadow-xl">
                <h2 className="text-xl font-semibold text-white">Snapshots</h2>
                <p className="mt-2 text-sm text-zinc-400">
                    No snapshots available yet.
                </p>
            </section>
        );
    }

    return (
        <section className="space-y-5">
            <div className="flex items-end justify-between gap-4">
                <div>
                    <h2 className="text-xl font-semibold text-white">Snapshots</h2>
                    <p className="mt-1 text-sm text-zinc-400">
                        {snapshots.length} images available
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {snapshots.map((snapshot) => (
                    <a
                        key={snapshot.name}
                        href={snapshot.url}
                        target="_blank"
                        rel="noreferrer"
                        className="group overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/80 shadow-lg transition hover:-translate-y-1 hover:border-zinc-700"
                    >
                        <div className="aspect-square overflow-hidden bg-black">
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