import SnapshotGallery from "@/components/snapshot-gallery";
import TimelapsePlayer from "@/components/timelapse-player";
import {isTimelapsePluginInstalled} from "@/lib/extension-status";
import {PUBLIC_PAGE_LEAD, PUBLIC_PAGE_TITLE} from "@/lib/public-ui";
import {WORKSPACE_BOARD_CLASS, WORKSPACE_HAIRLINE} from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function GalleryPage() {
    const pluginInstalled = await isTimelapsePluginInstalled();

    if (!pluginInstalled) {
        return (
            <main className="flex flex-1 flex-col py-10">
                <h1 className={PUBLIC_PAGE_TITLE}>
                    Gallery unavailable
                </h1>
                <p className={PUBLIC_PAGE_LEAD}>
                    The GrowCast Timelapse plugin is not installed on this instance, not running, or has not
                    taken pictures yet.
                </p>
            </main>
        );
    }

    return (
        <main className="flex flex-1 flex-col py-4">
            <section className={WORKSPACE_BOARD_CLASS}>
                <div className={`border-b px-4 py-3 sm:px-6 ${WORKSPACE_HAIRLINE}`}>
                    <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                        Gallery
                    </h1>
                </div>
                <TimelapsePlayer sheet/>
                <SnapshotGallery sheet/>
            </section>
        </main>
    );
}
