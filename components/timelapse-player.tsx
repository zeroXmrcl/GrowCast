import {getTimelapseFiles} from "@/lib/extension-status";

type TimelapsePlayerProps = {
    /**
     * Explicit video URL (archived grows). `null` renders the empty state,
     * `undefined` falls back to the live timelapse.
     */
    videoUrl?: string | null;
};

export default async function TimelapsePlayer({videoUrl}: TimelapsePlayerProps = {}) {
    let resolvedUrl: string | null;

    if (videoUrl === undefined) {
        const files = await getTimelapseFiles();
        resolvedUrl = files[0] ? "/api/timelapse" : null;
    } else {
        resolvedUrl = videoUrl;
    }

    if (!resolvedUrl) {
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

    return (
        <section className="space-y-5">
            <div className="flex items-end justify-between gap-4">
                <div>
                    <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Timelapse</h2>
                </div>
            </div>

            <div className="overflow-hidden rounded-3xl border border-zinc-800 bg-black shadow-2xl">
                <video
                    controls
                    preload="metadata"
                    className="block h-auto w-full"
                    aria-label="Grow timelapse"
                >
                    <source src={resolvedUrl} type="video/mp4"/>
                    Your browser does not support video.
                </video>
            </div>
        </section>
    );
}
