"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function SiteHeader() {
  const pathname = usePathname();
  const isAdminRoute = pathname.startsWith("/admin");

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 md:px-8">
        <Link href="/" className="flex items-center gap-3">
          <img src="/growCastLogo_green.svg" alt="Logo" className="h-8 w-8"/>
          <span className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">GrowCast</span>
        </Link>

        <nav className="flex items-center gap-3">
          {isAdminRoute ? (
            <>
              <Link
                href="/"
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                Dashboard
              </Link>
              <form action="/admin/logout" method="post">
                <button
                  type="submit"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                >
                  Sign Out
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/admin"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              Admin
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
