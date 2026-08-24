import SnapshotGallery from "@/components/snapshot-gallery";
import TimelapsePlayer from "@/components/timelapse-player";
import {isTimelapsePluginInstalled} from "@/lib/extension-status";

export const dynamic = "force-dynamic";

export default async function GalleryPage() {
    const pluginInstalled = await isTimelapsePluginInstalled();

    if (!pluginInstalled) {
        return (
            <main className="flex flex-1 flex-col py-10 text-zinc-900 dark:text-zinc-100">
                <h1 className="text-3xl font-bold tracking-tight">
                    Gallery unavailable
                </h1>
                <p className="mt-3 max-w-2xl text-zinc-600 dark:text-zinc-300">
                    The GrowCast Timelapse plugin is not installed on this instance, not running, or has not
                    taken pictures yet.
                </p>
            </main>
        );
    }

    return (
        <main className="flex flex-1 flex-col gap-10 py-10 text-zinc-900 dark:text-white">
            <TimelapsePlayer/>
            <SnapshotGallery/>
        </main>
    );
}
