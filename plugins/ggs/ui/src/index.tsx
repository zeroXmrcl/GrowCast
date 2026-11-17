"use client";

import {Card, definePlugin, PageShell, Stat, usePluginLive} from "@growcast/plugin-sdk/ui";

function EnergyPage() {
    return (
        <PageShell title="Tent energy">
            <p className="text-sm text-zinc-500">
                The live tent energy scoreboard stays on the GrowCast Energy workspace at /energy.
                This plugin owns the GGS ingest, climate history, and tent kWh data.
            </p>
            <a className="underline" href="/energy">Open energy workspace</a>
        </PageShell>
    );
}

function AdminPage() {
    return (
        <PageShell title="GGS">
            <p className="text-sm text-zinc-500">Spider Farmer login, sidecar status, devices, and energy settings:</p>
            <a className="underline" href="/admin/ggs">Open GGS admin</a>
        </PageShell>
    );
}

function LiveClimateWidget() {
    const live = usePluginLive();
    return (
        <Card>
            <Stat label="GGS" value={live.stale ? null : 1} unit={live.stale ? "stale" : "live"} />
        </Card>
    );
}

export default definePlugin({
    pages: {energy: EnergyPage, admin: AdminPage},
    widgets: {"live-climate": LiveClimateWidget},
});
