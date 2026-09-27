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
];

const BROADCAST_BANDS = [
    {id: "program", label: "Program"},
    {id: "mixer", label: "Mixer"},
    {id: "twitch", label: "Twitch"},
    {id: "camera-look", label: "Camera look"},
    {id: "music", label: "Music"},
    {id: "alerts", label: "Alerts"},
    {id: "obs", label: "OBS"},
    {id: "design", label: "Design"},
    {id: "camera", label: "Camera"},
];

const TIMELAPSE_BANDS = [
    {id: "capture", label: "Capture"},
    {id: "triggers", label: "Triggers"},
    {id: "output", label: "Output"},
];

const GGS_BANDS = [
    {id: "spider-farmer", label: "Spider Farmer"},
    {id: "sidecar", label: "Sidecar"},
    {id: "devices", label: "Devices"},
    {id: "energy", label: "Energy"},
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

function bandsFor(pathname: string, href: string): Array<{id: string; label: string}> {
    if (href === "/admin") {
        return GROW_BANDS;
    }
    if (href === "/admin/stream") {
        return BROADCAST_BANDS;
    }
    if (href === "/admin/timelapse") {
        return TIMELAPSE_BANDS;
    }
    if (href === "/admin/ggs") {
        return GGS_BANDS;
    }
    if (href === "/admin/archives") {
        return pathname === "/admin/archives" ? ARCHIVE_LIST_BANDS : ARCHIVE_EDITOR_BANDS;
    }
    return [];
}

export function AdminSectionNav({
    sections,
}: {
    sections: Array<{href: string; label: string}>;
}) {
    const pathname = usePathname();

    return (
        <nav className="mt-2 flex flex-col gap-1">
            {sections.map((item) => {
                const active = isAdminNavActive(pathname, item.href);
                const bands = bandsFor(pathname, item.href);
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
