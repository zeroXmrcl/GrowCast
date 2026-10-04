import {getTimelapseFiles} from "@/lib/extension-status";
import {PUBLIC_EMPTY_BODY, PUBLIC_EMPTY_TITLE} from "@/lib/public-ui";
import {WORKSPACE_HAIRLINE} from "@/lib/workspace";

type TimelapsePlayerProps = {
    /**
     * Explicit video URL (archived grows). `null` renders the empty state,
     * `undefined` falls back to the live timelapse.
     */
    videoUrl?: string | null;
    /** Flush 16:9 inside the gallery sheet. Archived grows keep the card. */
    sheet?: boolean;
};

export default async function TimelapsePlayer({videoUrl, sheet = false}: TimelapsePlayerProps = {}) {
    let resolvedUrl: string | null;

    if (videoUrl === undefined) {
        const files = await getTimelapseFiles();
        resolvedUrl = files[0] ? "/api/timelapse" : null;
    } else {
        resolvedUrl = videoUrl;
    }

    if (!resolvedUrl) {
        return (
            <section className={sheet ? `border-b p-4 sm:p-6 ${WORKSPACE_HAIRLINE}` : "p-4 sm:p-6"}>
                <h2 className={PUBLIC_EMPTY_TITLE}>
                    Timelapse
                </h2>
                <p className={PUBLIC_EMPTY_BODY}>
                    No timelapse created yet.
                </p>
            </section>
        );
    }

    if (sheet) {
        return (
            <div className={`border-b bg-black ${WORKSPACE_HAIRLINE}`}>
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
