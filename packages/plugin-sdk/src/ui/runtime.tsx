"use client";

import {
    createContext,
    createElement,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ComponentType,
    type ReactNode,
} from "react";

export type PluginRole = "visitor" | "admin";

export type PluginLiveView = {
    pluginId: string;
    observedAt: string | null;
    stale: boolean;
    metrics: Record<string, {value: number | null; unit: string; kind: string; stale: boolean}>;
    state: Record<string, unknown> | null;
    v: (key: string) => number | null;
    updatedAt: string | null;
};

export type PluginDefinition = {
    pages: Record<string, ComponentType>;
    widgets: Record<string, ComponentType>;
};

export type PluginRuntimeValue = {
    pluginId: string;
    pageId?: string;
    widgetId?: string;
    role: PluginRole;
    publicPage: boolean;
    pageData?: Record<string, unknown>;
};

type RuntimeValue = PluginRuntimeValue;

const RuntimeContext = createContext<RuntimeValue | null>(null);
const LiveContext = createContext<PluginLiveView | null>(null);

export function definePlugin(definition: PluginDefinition): PluginDefinition {
    return definition;
}

export function PluginRuntimeProvider({
    pluginId,
    pageId,
    widgetId,
    role,
    publicPage,
    pageData,
    children,
}: RuntimeValue & {children: ReactNode}) {
    const [live, setLive] = useState<PluginLiveView>(() => emptyLive(pluginId));
    useEffect(() => {
        let cancelled = false;
        const apply = (raw: Record<string, unknown>) => {
            if (cancelled) {
                return;
            }
            setLive(asLiveView(pluginId, raw));
        };
        void fetch(`/api/data/plugins/${pluginId}`, {cache: "no-store"})
            .then((res) => res.json())
            .then(apply)
            .catch(() => undefined);
        const stream = new EventSource(`/api/data/plugins/${pluginId}/stream`);
        stream.addEventListener("snapshot", (event) => {
            try {
                apply(JSON.parse((event as MessageEvent).data) as Record<string, unknown>);
            } catch {
                /* ignore */
            }
        });
        stream.addEventListener("heartbeat", (event) => {
            try {
                apply(JSON.parse((event as MessageEvent).data) as Record<string, unknown>);
            } catch {
                /* ignore */
            }
        });
        return () => {
            cancelled = true;
            stream.close();
        };
    }, [pluginId]);
    const runtime = useMemo(
        () => ({pluginId, pageId, widgetId, role, publicPage, pageData}),
        [pluginId, pageId, widgetId, role, publicPage, pageData],
    );
    return createElement(
        RuntimeContext.Provider,
        {value: runtime},
        createElement(LiveContext.Provider, {value: live}, children),
    );
}

function emptyLive(pluginId: string): PluginLiveView {
    return {
        pluginId,
        observedAt: null,
        stale: true,
        metrics: {},
        state: null,
        v: () => null,
        updatedAt: null,
    };
}

function asLiveView(pluginId: string, raw: Record<string, unknown>): PluginLiveView {
    const metrics = (raw.metrics ?? {}) as PluginLiveView["metrics"];
    return {
        pluginId,
        observedAt: typeof raw.observedAt === "string" ? raw.observedAt : null,
        stale: raw.stale === true,
        metrics,
        state: (raw.state as Record<string, unknown> | null) ?? null,
        v: (key: string) => metrics[key]?.value ?? null,
        updatedAt: typeof raw.observedAt === "string" ? raw.observedAt : null,
    };
}

export const ENERGY_TOKENS = {
    solar: "#16a34a",
    battery: "#0c7700",
    grid: "#0369a1",
} as const;

export function useTheme() {
    return {
        colors: {
            bg: "var(--background)",
            fg: "var(--foreground)",
            solar: "var(--gc-solar, #16a34a)",
            battery: "var(--gc-battery, #0c7700)",
            grid: "var(--gc-grid, #0369a1)",
        },
        fonts: {
            sans: "var(--font-geist-sans)",
            mono: "var(--font-geist-mono)",
        },
        links: {
            pluginAdmin: typeof window === "undefined" ? "/admin/plugins" : window.location.pathname,
        },
        dark: false,
    };
}

export type GrowCycle = {
    active: boolean;
    startedAt: string | null;
    endedAt: string | null;
};

function parseGrowCycle(raw: unknown): GrowCycle {
    if (!raw || typeof raw !== "object") {
        return {active: false, startedAt: null, endedAt: null};
    }
    const value = raw as {active?: unknown; startedAt?: unknown; endedAt?: unknown};
    return {
        active: value.active === true,
        startedAt: typeof value.startedAt === "string" ? value.startedAt : null,
        endedAt: typeof value.endedAt === "string" ? value.endedAt : null,
    };
}

export function useGrowCycle(): GrowCycle {
    const live = usePluginLive();
    const fromState = live.state && typeof live.state === "object"
        ? (live.state as {growCycle?: unknown}).growCycle
        : null;
    const fromLive = parseGrowCycle(fromState);
    const [fetched, setFetched] = useState<GrowCycle | null>(null);
    useEffect(() => {
        let cancelled = false;
        void fetch("/api/data/grow-cycle", {cache: "no-store"})
            .then((response) => (response.ok ? response.json() : null))
            .then((raw) => {
                if (!cancelled && raw) {
                    setFetched(parseGrowCycle(raw));
                }
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, []);
    return fetched ?? fromLive;
}

export function usePluginRuntime(): PluginRuntimeValue {
    return useContext(RuntimeContext) ?? {
        pluginId: "",
        role: "visitor",
        publicPage: true,
    };
}

export function usePluginLive(): PluginLiveView {
    const live = useContext(LiveContext);
    const runtime = useContext(RuntimeContext);
    return live ?? emptyLive(runtime?.pluginId || "unknown");
}

export function usePluginSeries(keys?: string[], opts?: {window?: string}) {
    void keys;
    void opts;
    return [] as Array<{t: string; value: number | null}>;
}

export function usePluginCounters(keys?: string[], opts?: {windows?: string[]}) {
    void keys;
    void opts;
    return {today: {}, "7d": {}, "30d": {}} as Record<string, Record<string, number | null>>;
}

export function usePluginApi() {
    const runtime = useContext(RuntimeContext);
    const pluginId = runtime?.pluginId ?? "";
    return {
        async get(path: string) {
            const res = await fetch(`/api/plugins/v1/${encodeURIComponent(pluginId)}/x/${path.replace(/^\//, "")}`, {
                credentials: "include",
                cache: "no-store",
            });
            return res.json();
        },
        async post(path: string, body: unknown) {
            const res = await fetch(`/api/plugins/v1/${encodeURIComponent(pluginId)}/x/${path.replace(/^\//, "")}`, {
                method: "POST",
                credentials: "include",
                headers: {"content-type": "application/json"},
                body: JSON.stringify(body),
            });
            return res.json();
        },
    };
}

export function useCoreData(name: string) {
    const live = usePluginLive();
    if (name === "energy") {
        const energy = live.state && typeof live.state === "object"
            ? (live.state as {tentEnergy?: unknown}).tentEnergy
            : null;
        return energy;
    }
    if (name === "grow") {
        const grow = live.state && typeof live.state === "object"
            ? (live.state as {growCycle?: unknown}).growCycle
            : null;
        return grow ?? null;
    }
    return null;
}

export function useAuth(): {role: PluginRole; publicPage: boolean} {
    const runtime = useContext(RuntimeContext);
    return {role: runtime?.role ?? "visitor", publicPage: runtime?.publicPage ?? true};
}
