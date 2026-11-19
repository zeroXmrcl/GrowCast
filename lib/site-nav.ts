export type NavItem = {href: string; label: string};

export type NavFlags = {
    showPastGrows: boolean;
    showSettingsLink: boolean;
};

const SETTINGS_ITEM: NavItem = {href: "/admin", label: "Settings"};

export function navItemsFor(pathname: string, flags: NavFlags, extra: NavItem[] = []): NavItem[] {
    const items: NavItem[] = [{href: "/", label: "Dashboard"}];
    items.push(...extra.filter((item) => item.href.startsWith("/p/")));
    if (flags.showPastGrows) {
        items.push({href: "/grows", label: "Past Grows"});
    }
    if (flags.showSettingsLink && !pathname.startsWith("/admin")) {
        items.push(SETTINGS_ITEM);
    }

    return items.filter((item) => {
        if (item.href === "/" || item.href.startsWith("/p/")) {
            return true;
        }
        return !navItemIsActive(pathname, item.href);
    });
}

export function navItemIsActive(pathname: string, href: string): boolean {
    if (href === "/") {
        return pathname === "/";
    }
    return pathname === href || pathname.startsWith(`${href}/`);
}
