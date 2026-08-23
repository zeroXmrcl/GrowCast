export type NavItem = {href: string; label: string};

const NAV_ITEMS: NavItem[] = [
    {href: "/", label: "Dashboard"},
    {href: "/energy", label: "Energy"},
    {href: "/gallery", label: "Gallery"},
    {href: "/grows", label: "Past Grows"},
];

const SETTINGS_ITEM: NavItem = {href: "/admin", label: "Settings"};

export function navItemsFor(pathname: string, showSettingsLink: boolean): NavItem[] {
    const items = NAV_ITEMS.filter((item) =>
        item.href === "/" ? pathname !== "/" : !pathname.startsWith(item.href),
    );

    if (showSettingsLink && !pathname.startsWith("/admin")) {
        items.push(SETTINGS_ITEM);
    }

    return items;
}
