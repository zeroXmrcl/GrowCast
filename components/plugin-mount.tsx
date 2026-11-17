"use client";

import {useEffect, useState, type ReactNode} from "react";
import {PluginRuntimeProvider, type PluginDefinition, type PluginRole} from "@growcast/plugin-sdk/ui";
import {pluginAssetUrl} from "@/lib/plugins/import-map";
import {loadFirstPartyUi} from "@/lib/plugins/ui-registry";

type PluginMountProps = {
    pluginId: string;
    version: string;
    entry?: string;
    webComponent?: string;
    pageId?: string;
    widgetId?: string;
    role: PluginRole;
    publicPage: boolean;
    styles?: string[];
};

type LoadState =
    | {kind: "loading"}
    | {kind: "ready"; definition: PluginDefinition; via: "import-map" | "first-party"}
    | {kind: "web-component"; tag: string}
    | {kind: "error"; message: string};

export default function PluginMount(props: PluginMountProps) {
    const [state, setState] = useState<LoadState>({kind: "loading"});

    useEffect(() => {
        let cancelled = false;
        async function load() {
            if (props.entry) {
                const url = pluginAssetUrl(props.pluginId, props.entry, props.version);
                try {
                    const mod = await import(/* webpackIgnore: true */ url) as {default?: PluginDefinition} & PluginDefinition;
                    const definition = mod.default ?? mod;
                    if (!cancelled && definition?.pages && definition?.widgets) {
                        setState({kind: "ready", definition, via: "import-map"});
                        return;
                    }
                } catch {
                    /* fall through to first-party, then web components */
                }
            }
            const firstParty = await loadFirstPartyUi(props.pluginId);
            if (!cancelled && firstParty) {
                setState({kind: "ready", definition: firstParty, via: "first-party"});
                return;
            }
            if (!cancelled && props.webComponent) {
                setState({kind: "web-component", tag: props.webComponent});
                return;
            }
            if (!cancelled) {
                setState({kind: "error", message: "Plugin UI failed to load"});
            }
        }
        void load();
        return () => {
            cancelled = true;
        };
    }, [props.entry, props.pluginId, props.version, props.webComponent]);

    if (state.kind === "loading") {
        return <PluginErrorCard message="Loading plugin…" tone="muted" />;
    }
    if (state.kind === "error") {
        return <PluginErrorCard message={state.message} />;
    }
    if (state.kind === "web-component") {
        return (
            <div
                dangerouslySetInnerHTML={{
                    __html: `<${state.tag} data-plugin-id="${props.pluginId}"></${state.tag}>`,
                }}
            />
        );
    }

    const Cmp = props.pageId
        ? state.definition.pages[props.pageId]
        : props.widgetId
            ? state.definition.widgets[props.widgetId]
            : null;
    if (!Cmp) {
        return <PluginErrorCard message="This plugin did not export the requested view." />;
    }
    return (
        <PluginRuntimeProvider
            pluginId={props.pluginId}
            pageId={props.pageId}
            widgetId={props.widgetId}
            role={props.role}
            publicPage={props.publicPage}
        >
            {props.styles?.map((href) => (
                <link key={href} rel="stylesheet" href={pluginAssetUrl(props.pluginId, href, props.version)} />
            ))}
            <Cmp />
        </PluginRuntimeProvider>
    );
}

function PluginErrorCard({message, tone}: {message: string; tone?: "muted"}) {
    return (
        <div className={`rounded-xl border p-4 text-sm ${
            tone === "muted"
                ? "border-zinc-200 text-zinc-500 dark:border-zinc-800"
                : "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100"
        }`}>
            {message}
        </div>
    );
}

export function PluginSlotFallback({children}: {children: ReactNode}) {
    return <>{children}</>;
}
