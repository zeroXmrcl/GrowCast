"use client";

import Link from "next/link";
import Image from "next/image";
import {usePathname} from "next/navigation";
import {useEffect, useRef, useState} from "react";

export default function SiteHeader() {
    const pathname = usePathname();
    const isAdminRoute = pathname.startsWith("/admin");

    const menuRef = useRef<HTMLDivElement | null>(null);

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
                                    }, 600)
                                );
                            }, 1200)
                        );
                    }, 600)
                );
            }, 600)
        );

        return () => {
            timeouts.forEach(clearTimeout);
        };
    }, []);

    return (
        <header
            className="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
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

                <div className="relative" ref={menuRef}>
                    {isAdminRoute ? (
                        <nav className="flex items-center gap-3">
                            <Link
                                href="/"
                                className="px-3 py-2 text-sm text-zinc-700 hover:text-zinc-800 dark:text-zinc-300 dark:hover:text-zinc-400"
                            >
                                Dashboard
                            </Link>
                            <form action="/admin/logout" method="post">
                                <button
                                    type="submit"
                                    className="cursor-pointer px-3 py-2 text-sm text-red-700 hover:text-red-800 dark:text-red-300 dark:hover:text-red-400"
                                >
                                    Sign Out
                                </button>
                            </form>
                        </nav>
                    ) : (
                        <>
                            <nav className="flex items-center gap-3">
                                <Link
                                    href="/gallery"
                                    className="px-3 py-2 text-sm text-zinc-700 hover:text-zinc-800 dark:text-zinc-300 dark:hover:text-zinc-400"
                                >
                                    Gallery
                                </Link>

                                <Link
                                    href="/admin"
                                    className="px-3 py-2 text-sm text-zinc-700 hover:text-zinc-800 dark:text-zinc-300 dark:hover:text-zinc-400"
                                >
                                    Settings
                                </Link>
                            </nav>
                        </>
                    )}
                </div>
            </div>
        </header>
    );
}