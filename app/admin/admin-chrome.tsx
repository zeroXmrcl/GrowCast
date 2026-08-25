import Image from "next/image";
import Link from "next/link";
import {AdminButton, NavLink} from "@/components/admin/ui";
import type {ReactNode} from "react";

export const SETTINGS_SECTION_LINKS = [
    {href: "#general", label: "General"},
    {href: "#lifecycle", label: "Lifecycle"},
    {href: "#climate", label: "Climate"},
    {href: "#energy", label: "Energy"},
    {href: "#status", label: "Status"},
    {href: "#notes", label: "Notes"},
    {href: "#hardware", label: "Hardware"},
    {href: "#stream", label: "Stream"},
    {href: "#overlay", label: "Overlay"},
    {href: "#timelapse", label: "Timelapse"},
    {href: "#socials", label: "Socials"},
    {href: "#pictures", label: "Pictures"},
    {href: "#archive", label: "Archive"},
];

export function AdminSignOutButton() {
    return (
        <form action="/admin/logout" method="post">
            <AdminButton type="submit" tone="secondary">Sign Out</AdminButton>
        </form>
    );
}

type AdminChromeProps = {
    title: string;
    eyebrow?: ReactNode;
    sections?: Array<{href: string; label: string}>;
    actions?: ReactNode;
    children: ReactNode;
};

export function AdminChrome({
    title,
    eyebrow = "Control Panel",
    sections,
    actions,
    children,
}: AdminChromeProps) {
    if (!sections?.length) {
        return (
            <div className="admin-theme min-h-screen bg-(--admin-bg) px-4 py-8 text-(--admin-text) sm:px-6 lg:px-8">
                <div className="mx-auto max-w-4xl space-y-6">
                    <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                            {typeof eyebrow === "string" ? (
                                <p className="text-xs text-(--admin-muted)">{eyebrow}</p>
                            ) : (
                                eyebrow
                            )}
                            <h1 className="mt-1 truncate text-lg font-semibold text-(--admin-text)">
                                {title}
                            </h1>
                        </div>
                        {actions}
                    </div>
                    {children}
                </div>
            </div>
        );
    }

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
                            {sections.map((item) => (
                                <NavLink key={item.href} href={item.href} label={item.label}/>
                            ))}
                        </nav>
                    </div>
                </div>
            </aside>

            <div className="min-w-0">
                <header className="sticky top-0 z-20 flex h-15.25 items-center justify-between border-b border-(--admin-border) bg-(--admin-bg) px-4 sm:px-6">
                    <div className="min-w-0">
                        {typeof eyebrow === "string" ? (
                            <p className="text-xs text-(--admin-muted)">{eyebrow}</p>
                        ) : (
                            eyebrow
                        )}
                        <p className="truncate text-sm font-semibold text-(--admin-text)">{title}</p>
                    </div>
                    {actions}
                </header>

                <main className="px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
                    <div className="space-y-6">{children}</div>
                </main>
            </div>
        </div>
    );
}
