"use client";

import {usePathname} from "next/navigation";
import {NavLink} from "@/components/admin/ui";

export function isAdminNavActive(pathname: string, href: string): boolean {
    if (href === "/admin") {
        return pathname === "/admin";
    }
    return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminSectionNav({
    sections,
}: {
    sections: Array<{href: string; label: string}>;
}) {
    const pathname = usePathname();

    return (
        <nav className="mt-2 flex flex-wrap gap-1 lg:block lg:space-y-1">
            {sections.map((item) => (
                <NavLink
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    active={isAdminNavActive(pathname, item.href)}
                />
            ))}
        </nav>
    );
}
