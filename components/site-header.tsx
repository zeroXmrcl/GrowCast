"use client";

import Link from "next/link";
import Image from "next/image";
import {usePathname} from "next/navigation";
import {useEffect, useState} from "react";
import {useWorkspaceNav} from "@/components/workspace-nav";
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
            className={`${WORKSPACE_VT.header} sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90`}
        >
            <div className={`${SITE_FRAME_CLASS} flex items-center justify-between py-3`}>
                {workspace ? (
                    <Link
                        href="/"
                        className="flex cursor-pointer items-center gap-3"
                        onClick={(event) => {
                            if (isPlainWorkspaceClick(event)) {
                                go("/", event);
                            }
                        }}
                    >
                        {logo}
                    </Link>
                ) : (
                    <Link href="/" className="flex items-center gap-3">
                        {logo}
                    </Link>
                )}

                <nav className="flex items-center gap-3">
                    {navItems.map((item) => {
                        const active = navItemIsActive(view, item.href);
                        const className = active
                            ? "cursor-pointer px-3 py-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100"
                            : "cursor-pointer px-3 py-2 text-sm text-zinc-700 hover:text-zinc-800 dark:text-zinc-300 dark:hover:text-zinc-400";
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
