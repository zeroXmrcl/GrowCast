"use client";

import Link from "next/link";
import Image from "next/image";
import {usePathname} from "next/navigation";
import {useEffect, useState} from "react";

type NavItem = {href: string; label: string};

function navItemsFor(pathname: string): NavItem[] {
    const isGalleryRoute = pathname.startsWith("/gallery");

    if (isGalleryRoute) {
        return [
            {href: "/", label: "Dashboard"},
            {href: "/admin", label: "Settings"},
        ];
    }

    return [
        {href: "/gallery", label: "Gallery"},
        {href: "/admin", label: "Settings"},
    ];
}

export default function SiteHeader() {
    const pathname = usePathname();
    const navItems = navItemsFor(pathname);

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

    return (
        <header
            className="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90"
        >
            <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 md:px-8">
                <Link href="/" className="flex items-center gap-3">
                    <Image
                        src="/growCastLogo_green.svg"
                        alt="Logo"
                        width={32}
                        height={32}
                        priority={true}
                    />
                    <span
                        className={`text-lg font-semibold text-zinc-900 transition-opacity duration-600 ease-in-out dark:text-zinc-100 ${
                            logoFading ? "opacity-0" : "opacity-100"
                        }`}
                    >
                        {logoText}
                    </span>
                </Link>

                <nav className="flex items-center gap-3">
                    {navItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className="px-3 py-2 text-sm text-zinc-700 hover:text-zinc-800 dark:text-zinc-300 dark:hover:text-zinc-400"
                        >
                            {item.label}
                        </Link>
                    ))}
                </nav>
            </div>
        </header>
    );
}
