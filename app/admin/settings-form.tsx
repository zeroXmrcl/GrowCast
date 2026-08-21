import Image from "next/image";
import Link from "next/link";
import {AdminButton, AdminPanel, NavLink} from "@/components/admin/ui";
import {CompleteGrowPanel} from "@/app/admin/complete-grow-panel";
import MediaManager from "@/app/admin/media-manager";
import {SettingsFields} from "@/app/admin/settings-fields";
import {SettingsNotice} from "@/app/admin/settings-notices";
import type {GrowRecord} from "@/lib/db";
import type {TimelapseSettings} from "@/lib/timelapse-settings";

const sectionLinks = [
    {href: "#general", label: "General"},
    {href: "#lifecycle", label: "Lifecycle"},
    {href: "#climate", label: "Climate"},
    {href: "#status", label: "Status"},
    {href: "#notes", label: "Notes"},
    {href: "#hardware", label: "Hardware"},
    {href: "#stream", label: "Stream"},
    {href: "#timelapse", label: "Timelapse"},
    {href: "#socials", label: "Socials"},
    {href: "#pictures", label: "Pictures"},
    {href: "#archive", label: "Archive"},
];

type SettingsFormProps = {
    grow: GrowRecord;
    timelapseSettings: TimelapseSettings;
    saved?: string;
    archived?: string;
    media?: string;
    error?: string;
    saveAction: (formData: FormData) => Promise<void>;
    completeAction: (formData: FormData) => Promise<void>;
};

export function AdminSettingsForm({
    grow,
    timelapseSettings,
    saved,
    archived,
    media,
    error,
    saveAction,
    completeAction,
}: SettingsFormProps) {
    return (
        <div className="admin-theme min-h-screen bg-(--admin-bg) text-(--admin-text) lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
            <aside className="border-b border-(--admin-border) bg-(--admin-surface) lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
                <div className="border-b border-(--admin-border) px-4 py-4">
                    <Link href="/" className="flex items-center gap-3">
                        <Image
                            src="/growCastLogo_white.svg"
                            alt="GrowCast"
                            width={28}
                            height={28}
                            priority
                        />
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-(--admin-text)">GrowCast</p>
                        </div>
                    </Link>
                </div>

                <div className="hidden space-y-6 px-3 py-4 lg:block">
                    <div>
                        <p className="px-3 text-xs font-medium text-(--admin-subtle)">Sections</p>
                        <nav className="mt-2 space-y-1">
                            {sectionLinks.map((item) => (
                                <NavLink key={item.href} href={item.href} label={item.label}/>
                            ))}
                        </nav>
                    </div>
                </div>
            </aside>

            <div className="min-w-0">
                <header className="sticky top-0 z-20 flex h-15.25 items-center justify-between border-b border-(--admin-border) bg-(--admin-bg) px-4 sm:px-6">
                    <div className="min-w-0">
                        <p className="text-xs text-(--admin-muted)">Control Panel</p>
                        <p className="truncate text-sm font-semibold text-(--admin-text)">Settings</p>
                    </div>

                    <div className="flex items-center gap-2">
                        <form action="/admin/logout" method="post">
                            <AdminButton type="submit" tone="secondary">Sign Out</AdminButton>
                        </form>
                    </div>
                </header>

                <main className="px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
                    <div className="space-y-6">
                        <SettingsNotice
                            saved={saved}
                            archived={archived}
                            media={media}
                            error={error}
                        />

                        <form
                            id="admin-settings-form"
                            action={saveAction}
                            className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]"
                        >
                            <SettingsFields grow={grow} timelapseSettings={timelapseSettings}/>

                            <div className="space-y-6 xl:sticky xl:top-20 xl:self-start">
                                <AdminPanel
                                    title="Apply Changes"
                                    description="Changes will be live immediately."
                                >
                                    <div className="space-y-4">
                                        <AdminButton type="submit" tone="primary" className="w-full">
                                            Save Changes
                                        </AdminButton>
                                    </div>
                                </AdminPanel>

                                <AdminPanel
                                    title="Quick Links"
                                    description="Jump to the most important sites."
                                >
                                    <div className="grid gap-2">
                                        <Link
                                            href="/"
                                            target="_blank"
                                            className="rounded-xl border border-(--admin-border) bg-(--admin-bg) px-3 py-2 text-sm font-medium text-(--admin-text) transition hover:border-zinc-500 hover:bg-(--admin-surface-muted)"
                                        >
                                            Open Dashboard
                                        </Link>
                                        <Link
                                            href="/admin/archives"
                                            className="rounded-xl border border-(--admin-border) bg-(--admin-bg) px-3 py-2 text-sm font-medium text-(--admin-text) transition hover:border-zinc-500 hover:bg-(--admin-surface-muted)"
                                        >
                                            Manage Archives
                                        </Link>
                                        <Link
                                            href="https://growcast.0xmarcel.com/"
                                            target="_blank"
                                            className="rounded-xl border border-(--admin-border) bg-(--admin-bg) px-3 py-2 text-sm font-medium text-(--admin-text) transition hover:border-zinc-500 hover:bg-(--admin-surface-muted)"
                                        >
                                            GrowCast Website
                                        </Link>
                                        <Link
                                            href="https://github.com/zeroXmrcl/GrowCast"
                                            target="_blank"
                                            className="rounded-xl border border-(--admin-border) bg-(--admin-bg) px-3 py-2 text-sm font-medium text-(--admin-text) transition hover:border-zinc-500 hover:bg-(--admin-surface-muted)"
                                        >
                                            GitHub Repo
                                        </Link>
                                    </div>
                                </AdminPanel>
                            </div>
                        </form>

                        <MediaManager/>

                        <CompleteGrowPanel completeAction={completeAction}/>
                    </div>
                </main>
            </div>
        </div>
    );
}
