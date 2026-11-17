"use client";

import {definePlugin, PageShell} from "@growcast/plugin-sdk/ui";

function GalleryPage() {
    return (
        <PageShell title="Timelapse">
            <p className="text-sm text-zinc-500">Snapshots and the latest timelapse remain on the Gallery page.</p>
            <a className="underline" href="/gallery">Open gallery</a>
        </PageShell>
    );
}

function AdminPage() {
    return (
        <PageShell title="Timelapse">
            <a className="underline" href="/admin/timelapse">Open timelapse settings</a>
        </PageShell>
    );
}

export default definePlugin({
    pages: {gallery: GalleryPage, admin: AdminPage},
    widgets: {},
});
