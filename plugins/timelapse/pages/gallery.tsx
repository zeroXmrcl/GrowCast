"use client";

import SnapshotGallery from "@/plugins/timelapse/ui/snapshot-gallery";
import TimelapsePlayer from "@/plugins/timelapse/ui/timelapse-player";
import {WORKSPACE_BOARD_CLASS} from "@/lib/workspace";

export default function GalleryPage() {
    return (
        <main className="flex flex-1 flex-col py-4 text-zinc-900 dark:text-zinc-100">
            <section className={WORKSPACE_BOARD_CLASS}>
                <TimelapsePlayer sheet/>
                <SnapshotGallery sheet/>
            </section>
        </main>
    );
}
