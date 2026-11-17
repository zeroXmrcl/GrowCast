"use client";

import {definePlugin, PageShell, Stat, usePluginLive} from "@growcast/plugin-sdk/ui";

function HomePage() {
    const live = usePluginLive();
    return (
        <PageShell title="Example" updatedAt={live.updatedAt} stale={live.stale}>
            <Stat label="Example" value={live.v("example.value")} />
        </PageShell>
    );
}

function AdminPage() {
    return (
        <PageShell title="Example settings">
            <p>Save config from Admin → Plugins.</p>
        </PageShell>
    );
}

function StatWidget() {
    const live = usePluginLive();
    return <Stat label="Example" value={live.v("example.value")} />;
}

export default definePlugin({
    pages: {home: HomePage, admin: AdminPage},
    widgets: {stat: StatWidget},
});
