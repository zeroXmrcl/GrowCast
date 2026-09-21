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
import {isWorkspaceHandoff, WORKSPACE_MORPH_MS} from "@/lib/workspace";

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

function prefersReducedMotion(): boolean {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function canViewTransition(): boolean {
    return typeof document.startViewTransition === "function" && !prefersReducedMotion();
}

function hasDashPanels(): boolean {
    return Boolean(document.querySelector(".growcast-area-details"));
}

function keepCameraInView(): void {
    const cam = document.querySelector(".growcast-area-cam");
    if (!(cam instanceof HTMLElement)) {
        return;
    }
    const header = document.querySelector(".vt-header");
    const headerH = header instanceof HTMLElement ? header.getBoundingClientRect().height : 0;
    const top = cam.getBoundingClientRect().top;
    if (top < headerH + 8) {
        window.scrollBy(0, top - headerH - 8);
    }
}

function morphWorkspace(
    href: string,
    setView: (href: string) => void,
    afterMorph: () => void,
    syncUrl: boolean,
): void {
    keepCameraInView();
    const apply = () => {
        applyWorkspacePage(href);
        flushSync(() => {
            setView(href);
        });
    };
    let settled = false;
    const done = () => {
        if (settled) {
            return;
        }
        settled = true;
        afterMorph();
    };
    if (!canViewTransition()) {
        apply();
        if (syncUrl) {
            syncWorkspaceUrl(href);
        }
        done();
        return;
    }
    try {
        const transition = document.startViewTransition(apply);
        const timeout = window.setTimeout(done, WORKSPACE_MORPH_MS + 80);
        const clear = () => {
            window.clearTimeout(timeout);
            done();
        };
        void transition.ready.catch(() => {
            // skipped — board already swapped
        });
        void transition.finished.then(clear).catch(clear);
    } catch {
        apply();
        done();
        if (syncUrl) {
            syncWorkspaceUrl(href);
        }
        return;
    }
    if (syncUrl) {
        syncWorkspaceUrl(href);
    }
}

export function WorkspaceNavProvider({children}: {children: ReactNode}) {
    const pathname = usePathname();
    const router = useRouter();
    const [view, setView] = useState(pathname);
    const viewRef = useRef(pathname);
    const pending = useRef<string | null>(null);
    const busy = useRef(false);
    const waitingForDash = useRef(false);

    useEffect(() => {
        router.prefetch("/");
        router.prefetch("/energy");
    }, [router]);

    const finish = useCallback(() => {
        busy.current = false;
        pending.current = null;
    }, []);

    const adopt = useCallback(
        (href: string) => {
            viewRef.current = href;
            setView(href);
        },
        [],
    );

    const syncTo = useCallback(
        (href: string, syncUrl: boolean) => {
            if (viewRef.current === href || pending.current === href) {
                return;
            }
            if (!isWorkspaceHandoff(viewRef.current, href)) {
                viewRef.current = href;
                setView(href);
                return;
            }
            busy.current = true;
            pending.current = href;
            morphWorkspace(href, adopt, finish, syncUrl);
        },
        [adopt, finish],
    );

    useEffect(() => {
        if (waitingForDash.current) {
            if (pathname === "/" && hasDashPanels()) {
                waitingForDash.current = false;
                morphWorkspace("/", adopt, finish, false);
            }
            return;
        }
        syncTo(pathname, false);
    }, [adopt, finish, pathname, syncTo]);

    useEffect(() => {
        function onPop() {
            waitingForDash.current = false;
            syncTo(window.location.pathname, false);
        }
        window.addEventListener("popstate", onPop);
        return () => {
            window.removeEventListener("popstate", onPop);
        };
    }, [syncTo]);

    const go = useCallback(
        (href: string, event?: {preventDefault: () => void}) => {
            if (busy.current || href === viewRef.current) {
                event?.preventDefault();
                return;
            }
            if (!isWorkspaceHandoff(viewRef.current, href)) {
                return;
            }
            event?.preventDefault();
            if (href === "/" && !hasDashPanels()) {
                busy.current = true;
                pending.current = href;
                waitingForDash.current = true;
                router.push("/");
                return;
            }
            syncTo(href, true);
        },
        [router, syncTo],
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
