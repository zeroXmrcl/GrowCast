import { getTimelapseFiles } from "@/lib/extension-status";

export default async function TimelapsePlayer() {
    const files = await getTimelapseFiles();
    const latestFile = files[0];

    if (!latestFile) {
        return (
            <section className="p-4">
                <h2 className="font-medium text-zinc-900 dark:text-zinc-100">
                    Timelapse
                </h2>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    No timelapse created yet.
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