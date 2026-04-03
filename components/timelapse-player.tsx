import { getTimelapseFiles } from "@/lib/extension-status";

export default async function TimelapsePlayer() {
    const files = await getTimelapseFiles();
    const latestFile = files[0];

    if (!latestFile) {
        return (
            <section className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-6 shadow-xl">
                <h2 className="text-xl font-semibold text-white">Timelapse</h2>
                <p className="mt-2 text-sm text-zinc-400">
                    No timelapse available yet.
                </p>
            </section>
        );
    }

    const videoUrl = `/api/timelapse/${encodeURIComponent(latestFile)}`;

    return (
        <section className="space-y-5">
            <div className="flex items-end justify-between gap-4">
                <div>
                    <h2 className="text-xl font-semibold text-white">Timelapse</h2>
                    <p className="mt-1 text-sm text-zinc-400">
                        Latest generated video
                    </p>
                </div>
            </div>

            <div className="overflow-hidden rounded-3xl border border-zinc-800 bg-black shadow-2xl">
                <video
                    controls
                    preload="metadata"
                    className="block h-auto w-full"
                >
                    <source src={videoUrl} type="video/mp4" />
                    Your browser does not support the video tag.
                </video>
            </div>
        </section>
    );
}