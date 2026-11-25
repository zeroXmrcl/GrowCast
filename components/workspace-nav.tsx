"use client";

import {createContext, useCallback, useContext, type ReactNode} from "react";
import {usePathname, useRouter} from "next/navigation";

type WorkspaceNav = {
    view: string;
    go: (href: string, event?: {preventDefault: () => void}) => void;
};

const WorkspaceNavContext = createContext<WorkspaceNav | null>(null);

/**
 * Dashboard and Energy used to animate in place. That path updated the URL
 * without a Next navigation and only toggled data-page, so the energy slot
 * stayed empty: plugin pages are separate routes and are not mounted beside
 * the dashboard. One shared animation cannot cover every plugin page, because
 * those pages do not share one grid. Header links now call router.push.
 * Back and forward follow the router.
 */
export function WorkspaceNavProvider({children}: {children: ReactNode}) {
    const view = usePathname();
    const router = useRouter();
    const go = useCallback((href: string, event?: {preventDefault: () => void}) => {
        event?.preventDefault();
        if (href === view) {
            return;
        }
        router.push(href);
    }, [router, view]);

    return (
        <WorkspaceNavContext.Provider value={{view, go}}>
            {children}
        </WorkspaceNavContext.Provider>
    );
}

export function useWorkspaceNav(): WorkspaceNav {
    const ctx = useContext(WorkspaceNavContext);
    const pathname = usePathname();
    const router = useRouter();
    if (ctx) {
        return ctx;
    }
    return {
        view: pathname,
        go: (href) => {
            router.push(href);
        },
    };
}
