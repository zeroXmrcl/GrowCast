"use client";

import AdminSolarPage from "@/plugins/solar/admin/page";

/** Public layout of the admin settings form for screenshots and local preview. */
export default function SolarSettingsPreviewPage() {
    return (
        <div className="admin-theme min-h-screen p-6 text-(--admin-text)" style={{background: "var(--admin-bg, #1f1f1f)"}}>
            <p className="mb-2 text-xs uppercase tracking-wide text-(--admin-muted, #a1a1aa)">Settings · growcast.solar</p>
            <h1 className="mb-6 text-2xl font-semibold">Solar</h1>
            <AdminSolarPage preview />
        </div>
    );
}
