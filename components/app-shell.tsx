"use client";

import type {ReactNode} from "react";
import {usePathname} from "next/navigation";
import SiteHeader from "@/components/site-header";

type AppShellProps = {
    children: ReactNode;
};

export default function AppShell({children}: AppShellProps) {
    const pathname = usePathname();
    const isAdminRoute = pathname.startsWith("/admin");

    if (isAdminRoute) {
        return <div className="min-h-full">{children}</div>;
    }

    return (
        <div className="flex min-h-full flex-col">
            <SiteHeader/>
            <div className="flex flex-1 flex-col">{children}</div>
        </div>
    );
}
