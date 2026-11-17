"use client";

import {definePlugin, PageShell} from "@growcast/plugin-sdk/ui";

function AdminPage() {
    return (
        <PageShell title="Broadcast">
            <p className="text-sm text-zinc-500">Twitch restream, music, alerts, and camera look stay on Broadcast.</p>
            <a className="underline" href="/admin/stream">Open Broadcast</a>
        </PageShell>
    );
}

export default definePlugin({
    pages: {admin: AdminPage},
    widgets: {},
});
