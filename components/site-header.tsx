"use client";

import Link from "next/link";
import Image from "next/image";
import {usePathname} from "next/navigation";
import {useEffect, useState} from "react";
import {useWorkspaceNav} from "@/components/workspace-nav";
import {
    PUBLIC_FOCUS,
    PUBLIC_NAV_LINK_ACTIVE,
    PUBLIC_NAV_LINK_IDLE,
} from "@/lib/public-ui";
import {SITE_FRAME_CLASS} from "@/lib/site-frame";
import {navItemIsActive, navItemsFor, type NavFlags} from "@/lib/site-nav";
import {isPlainWorkspaceClick, isWorkspacePath, WORKSPACE_VT} from "@/lib/workspace";

export default function SiteHeader({
    showEnergy = false,
    showGallery = false,
    showPastGrows = false,
    showSettingsLink = false,
}: NavFlags) {
    const pathname = usePathname();
    const {view, go} = useWorkspaceNav();
    const navItems = navItemsFor(pathname, {
        showEnergy,
        showGallery,
        showPastGrows,
        showSettingsLink,
    });
    const workspace = isWorkspacePath(view);

    const [logoText, setLogoText] = useState("GrowCast");
    const [logoFading, setLogoFading] = useState(false);

    useEffect(() => {
        const timeouts: ReturnType<typeof setTimeout>[] = [];

        timeouts.push(
            setTimeout(() => {
                setLogoFading(true);
                timeouts.push(
                    setTimeout(() => {
                        setLogoText("Welcome");
                        setLogoFading(false);
                        timeouts.push(
                            setTimeout(() => {
                                setLogoFading(true);
                                timeouts.push(
                                    setTimeout(() => {
                                        setLogoText("GrowCast");
                                        setLogoFading(false);
                                    }, 600),
                                );
                            }, 1200),
                        );
                    }, 600),
                );
            }, 600),
        );

        return () => {
            timeouts.forEach(clearTimeout);
        };
    }, []);

    const logo = (
        <>
            <Image src="/growCastLogo_green.svg" alt="Logo" width={32} height={32} priority={true} />
            <span
                className={`text-lg font-semibold tracking-tight text-zinc-900 transition-opacity duration-600 ease-in-out dark:text-zinc-100 ${
                    logoFading ? "opacity-0" : "opacity-100"
                }`}
            >
                {logoText}
            </span>
        </>
    );

    return (
        <header
            className={`${WORKSPACE_VT.header} sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90`}
        >
            <div className={`${SITE_FRAME_CLASS} flex items-center justify-between gap-4 py-2`}>
                {workspace ? (
                    <Link
                        href="/"
                        className={`flex min-h-11 shrink-0 cursor-pointer items-center gap-3 rounded-md px-1 ${PUBLIC_FOCUS}`}
                        onClick={(event) => {
                            if (isPlainWorkspaceClick(event)) {
                                go("/", event);
                            }
                        }}
                    >
                        {logo}
                    </Link>
                ) : (
                    <Link
                        href="/"
                        className={`flex min-h-11 shrink-0 items-center gap-3 rounded-md px-1 ${PUBLIC_FOCUS}`}
                    >
                        {logo}
                    </Link>
                )}

                <nav aria-label="Site" className="-mr-1 flex min-w-0 items-center justify-end gap-1 overflow-x-auto p-1">
                    {navItems.map((item) => {
                        const active = navItemIsActive(view, item.href);
                        const className = active ? PUBLIC_NAV_LINK_ACTIVE : PUBLIC_NAV_LINK_IDLE;
                        const workspaceTab = workspace && isWorkspacePath(item.href);
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                aria-current={active ? "page" : undefined}
                                onClick={
                                    workspaceTab
                                        ? (event) => {
                                            if (isPlainWorkspaceClick(event)) {
                                                go(item.href, event);
                                            }
                                        }
                                        : undefined
                                }
                                className={className}
                            >
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>
            </div>
        </header>
    );
}
