"use client";

import {usePathname} from "next/navigation";
import {NavLink} from "@/components/admin/ui";

export function isAdminNavActive(pathname: string, href: string): boolean {
    if (href === "/admin") {
        return pathname === "/admin";
    }
    return pathname === href || pathname.startsWith(`${href}/`);
}

const GROW_BANDS = [
    {id: "general", label: "General"},
    {id: "lifecycle", label: "Lifecycle"},
    {id: "climate", label: "Climate"},
    {id: "status", label: "Status"},
    {id: "notes", label: "Notes"},
    {id: "hardware", label: "Hardware"},
    {id: "socials", label: "Socials"},
    {id: "pictures", label: "Pictures"},
    {id: "obs", label: "OBS"},
    {id: "design", label: "Design"},
    {id: "camera", label: "Camera"},
];

const ARCHIVE_LIST_BANDS = [
    {id: "complete", label: "Complete Grow"},
    {id: "past", label: "Past grows"},
];

const ARCHIVE_EDITOR_BANDS = [
    {id: "details", label: "Details"},
    {id: "snapshots", label: "Snapshots"},
    {id: "pictures", label: "Pictures"},
    {id: "timelapse", label: "Timelapse"},
    {id: "danger", label: "Danger Zone"},
];

const SECURITY_BANDS = [
    {id: "authenticator", label: "Authenticator"},
    {id: "recovery", label: "Recovery"},
    {id: "turn-off", label: "Turn off"},
];

function bandsFor(
    pathname: string,
    href: string,
    extra?: Array<{id: string; label: string}>,
): Array<{id: string; label: string}> {
    if (extra && extra.length > 0) {
        return extra;
    }
    if (href === "/admin") {
        return GROW_BANDS;
    }
    if (href === "/admin/archives") {
        return pathname === "/admin/archives" ? ARCHIVE_LIST_BANDS : ARCHIVE_EDITOR_BANDS;
    }
    if (href === "/admin/security") {
        return SECURITY_BANDS;
    }
    return [];
}

export function AdminSectionNav({
    sections,
}: {
    sections: Array<{href: string; label: string; bands?: Array<{id: string; label: string}>}>;
}) {
    const pathname = usePathname();

    return (
        <nav className="mt-2 flex flex-col gap-1">
            {sections.map((item) => {
                const active = isAdminNavActive(pathname, item.href);
                const bands = bandsFor(pathname, item.href, item.bands);
                return (
                    <div key={item.href}>
                        <NavLink href={item.href} label={item.label} active={active}/>
                        <div className={active ? "admin-nav-roll admin-nav-roll-open" : "admin-nav-roll"}>
                            <div className="min-h-0 overflow-hidden" inert={active ? undefined : true}>
                                <div className="flex flex-col py-1">
                                    {bands.map((band) => {
                                        const href = active ? `${pathname}#${band.id}` : `${item.href}#${band.id}`;
                                        return (
                                        <a
                                            key={band.id}
                                            href={href}
                                            className="rounded-md px-3 py-1.5 pl-6 text-sm text-(--admin-subtle) hover:text-(--admin-text)"
                                            onClick={(event) => {
                                                if (!active) {
                                                    return;
                                                }
                                                const target = document.getElementById(band.id);
                                                if (!target) {
                                                    return;
                                                }
                                                event.preventDefault();
                                                target.scrollIntoView({behavior: "smooth", block: "start"});
                                            }}
                                        >
                                            {band.label}
                                        </a>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </nav>
    );
}
