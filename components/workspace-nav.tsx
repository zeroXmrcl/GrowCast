"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";
import {flushSync} from "react-dom";
import {usePathname, useRouter} from "next/navigation";
import {isWorkspaceHandoff} from "@/lib/workspace";

type WorkspaceNav = {
    view: string;
    go: (href: string, event?: {preventDefault: () => void}) => void;
};

const WorkspaceNavContext = createContext<WorkspaceNav | null>(null);

export function applyWorkspacePage(href: string): void {
    const board = document.querySelector(".growcast-board");
    if (!(board instanceof HTMLElement)) {
        return;
    }
    const energy = href === "/energy";
    const named = Boolean(board.querySelector(".growcast-area-name"));
    board.setAttribute("data-page", energy ? "energy" : named ? "dash" : "dash-noname");
}

function syncWorkspaceUrl(href: string): void {
    if (window.location.pathname === href) {
        return;
    }
    window.history.pushState(null, "", href);
}

function morphWorkspace(
    href: string,
    setView: (href: string) => void,
    afterMorph: () => void,
): void {
    const apply = () => {
        applyWorkspacePage(href);
        flushSync(() => {
            setView(href);
        });
    };
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof document.startViewTransition !== "function") {
        apply();
        syncWorkspaceUrl(href);
        afterMorph();
        return;
    }
    const transition = document.startViewTransition(apply);
    void transition.ready.catch(() => {
        // skipped — board already swapped
    });
    void transition.finished.then(afterMorph).catch(() => {
        afterMorph();
    });
    syncWorkspaceUrl(href);
}

export function WorkspaceNavProvider({children}: {children: ReactNode}) {
    const pathname = usePathname();
    const router = useRouter();
    const [view, setView] = useState(pathname);
    const pending = useRef<string | null>(null);

    useEffect(() => {
        router.prefetch("/");
        router.prefetch("/energy");
    }, [router]);

    useEffect(() => {
        if (pending.current) {
            if (pathname === pending.current) {
                pending.current = null;
                setView(pathname);
            }
            return;
        }
        setView(pathname);
    }, [pathname]);

    const go = useCallback(
        (href: string, event?: {preventDefault: () => void}) => {
            if (pending.current === href) {
                event?.preventDefault();
                return;
            }
            if (!isWorkspaceHandoff(pending.current ?? view, href)) {
                return;
            }
            event?.preventDefault();
            pending.current = href;
            morphWorkspace(href, setView, () => {
                if (href === "/" && !document.querySelector(".growcast-area-details")) {
                    router.push("/");
                }
            });
        },
        [router, view],
    );

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
