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

type RuntimeValue = {
    pluginId: string;
    pageId?: string;
    widgetId?: string;
    role: PluginRole;
    publicPage: boolean;
};

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
        () => ({pluginId, pageId, widgetId, role, publicPage}),
        [pluginId, pageId, widgetId, role, publicPage],
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

export function useTheme() {
    return {
        colors: {
            bg: "var(--background)",
            fg: "var(--foreground)",
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

export function usePluginLive(): PluginLiveView {
    return useContext(LiveContext) ?? emptyLive("unknown");
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
            const res = await fetch(`/api/plugins/v1/${pluginId}/x/${path.replace(/^\//, "")}`);
            return res.json();
        },
        async post(path: string, body: unknown) {
            const res = await fetch(`/api/plugins/v1/${pluginId}/x/${path.replace(/^\//, "")}`, {
                method: "POST",
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
    return null;
}

export function useAuth(): {role: PluginRole; publicPage: boolean} {
    const runtime = useContext(RuntimeContext);
    return {role: runtime?.role ?? "visitor", publicPage: runtime?.publicPage ?? true};
}
