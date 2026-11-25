"use client";

import Link from "next/link";
import Image from "next/image";
import {usePathname} from "next/navigation";
import {useEffect, useState} from "react";
import {useWorkspaceNav} from "@/components/workspace-nav";
import {logoCrossfadeAllowed, prefersReducedMotion} from "@/lib/logo-motion";
import {SITE_FRAME_CLASS} from "@/lib/site-frame";
import {navItemIsActive, navItemsFor, type NavFlags, type NavItem} from "@/lib/site-nav";
import {isPlainWorkspaceClick, isWorkspacePath, WORKSPACE_VT} from "@/lib/workspace";

export default function SiteHeader({
    showPastGrows = false,
    showSettingsLink = false,
    extra = [],
}: NavFlags & {extra?: NavItem[]}) {
    const pathname = usePathname();
    const {view, go} = useWorkspaceNav();
    const navItems = navItemsFor(pathname, {
        showPastGrows,
        showSettingsLink,
    }, extra);
    const workspace = isWorkspacePath(view);

    const [logoText, setLogoText] = useState("GrowCast");
    const [logoFading, setLogoFading] = useState(false);

    useEffect(() => {
        if (!logoCrossfadeAllowed(prefersReducedMotion())) {
            return;
        }
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
                className={`text-lg font-semibold text-zinc-900 transition-opacity duration-600 ease-in-out dark:text-zinc-100 ${
                    logoFading ? "opacity-0" : "opacity-100"
                }`}
            >
                {logoText}
            </span>
        </>
    );

    return (
        <header
            className={`${WORKSPACE_VT.header} sticky top-0 z-40 bg-white/90 backdrop-blur dark:bg-zinc-950/90`}
        >
            <div className={`${SITE_FRAME_CLASS} flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-3`}>
                {workspace ? (
                    <Link
                        href="/"
                        className="flex shrink-0 cursor-pointer items-center gap-3"
                        onClick={(event) => {
                            if (isPlainWorkspaceClick(event)) {
                                go("/", event);
                            }
                        }}
                    >
                        {logo}
                    </Link>
                ) : (
                    <Link href="/" className="flex shrink-0 items-center gap-3">
                        {logo}
                    </Link>
                )}

                <nav className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-x-1 gap-y-0.5 sm:gap-x-3">
                    {navItems.map((item) => {
                        const active = navItemIsActive(view, item.href);
                        const className = active
                            ? "cursor-pointer whitespace-nowrap px-2 py-2 text-sm font-semibold text-zinc-900 sm:px-3 dark:text-zinc-100"
                            : "cursor-pointer whitespace-nowrap px-2 py-2 text-sm text-zinc-700 hover:text-zinc-800 sm:px-3 dark:text-zinc-300 dark:hover:text-zinc-400";
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
