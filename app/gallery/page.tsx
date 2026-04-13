import SnapshotGallery from "@/components/snapshot-gallery";
import TimelapsePlayer from "@/components/timelapse-player";
import { isTimelapsePluginInstalled } from "@/lib/extension-status";

export const dynamic = "force-dynamic";

export default async function GalleryPage() {
    const pluginInstalled = await isTimelapsePluginInstalled();

    if (!pluginInstalled) {
        return (
            <main className="min-h-screen bg-white px-6 py-10 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
                <div className="mx-auto max-w-5xl">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">
                            Gallery unavailable
                        </h1>
                        <p className="mt-3 max-w-2xl text-zinc-600 dark:text-zinc-300">
                            The GrowCast Timelapse plugin is not installed on this instance, not running, or has not taken pictures yet.
                        </p>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-white">
            <div className="mx-auto flex max-w-7xl flex-col gap-10 px-6 py-10">
                <TimelapsePlayer />
                <SnapshotGallery />
            </div>
        </main>
    );
}
