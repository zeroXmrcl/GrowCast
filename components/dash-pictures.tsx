import {listMediaUrls} from "@/lib/media-library";

export default async function DashPictures() {
    const images = await listMediaUrls("dashboard");

    if (images.length === 0) {
        return null;
    }

    return (
        <section className="space-y-6">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {images.map((snapshot) => {
                    const fileName = decodeURIComponent(snapshot.split("/").pop() ?? snapshot);

                    return (
                        <a
                            key={snapshot}
                            href={snapshot}
                            target="_blank"
                            rel="noreferrer"
                            className="group overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
                        >
                            <div className="aspect-video w-full overflow-hidden bg-zinc-100 dark:bg-zinc-900">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={snapshot}
                                    alt={fileName}
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                />
                            </div>
                        </a>
                    );
                })}
            </div>
        </section>
    );
}