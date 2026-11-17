"use client";

import {useEffect, useRef, useState, type ReactNode} from "react";
import type {PluginDefinition, PluginRole} from "@growcast/plugin-sdk/ui";
import {pluginAssetUrl} from "@/lib/plugins/import-map";

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
    pageData?: Record<string, unknown>;
};

type ImportMapReact = {
    default?: {createElement: (...args: unknown[]) => unknown};
    createElement?: (...args: unknown[]) => unknown;
};

type ImportMapReactDom = {
    default?: {createRoot: (el: Element) => {render: (node: unknown) => void; unmount: () => void}};
    createRoot?: (el: Element) => {render: (node: unknown) => void; unmount: () => void};
};

type ImportMapSdk = {
    PluginRuntimeProvider: unknown;
};

export default function PluginMount(props: PluginMountProps) {
    const hostRef = useRef<HTMLDivElement>(null);
    const [message, setMessage] = useState("");
    const [failed, setFailed] = useState(false);
    const [webComponent, setWebComponent] = useState<string | null>(null);

    useEffect(() => {
        const host = hostRef.current;
        let cancelled = false;
        let root: {render: (node: unknown) => void; unmount: () => void} | null = null;

        async function load() {
            if (!props.entry) {
                if (props.webComponent) {
                    setWebComponent(props.webComponent);
                    setMessage("");
                    return;
                }
                setFailed(true);
                setMessage("Plugin UI failed to load");
                return;
            }
            const url = pluginAssetUrl(props.pluginId, props.entry, props.version);
            try {
                const [reactMod, reactDomMod, sdkMod, pluginMod] = await Promise.all([
                    import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "react") as Promise<ImportMapReact>,
                    import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "react-dom/client") as Promise<ImportMapReactDom>,
                    import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "@growcast/plugin-sdk/ui") as Promise<ImportMapSdk>,
                    import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url) as Promise<{default?: PluginDefinition} & PluginDefinition>,
                ]);
                if (cancelled) {
                    return;
                }
                const definition = pluginMod.default ?? pluginMod;
                const Cmp = props.pageId
                    ? definition.pages?.[props.pageId]
                    : props.widgetId
                        ? definition.widgets?.[props.widgetId]
                        : null;
                const createElement = reactMod.createElement ?? reactMod.default?.createElement;
                const createRoot = reactDomMod.createRoot ?? reactDomMod.default?.createRoot;
                if (!Cmp || !host || !createElement || !createRoot || !sdkMod.PluginRuntimeProvider) {
                    setFailed(true);
                    setMessage("This plugin did not export the requested view.");
                    return;
                }
                root = createRoot(host);
                root.render(
                    createElement(
                        sdkMod.PluginRuntimeProvider,
                        {
                            pluginId: props.pluginId,
                            pageId: props.pageId,
                            widgetId: props.widgetId,
                            role: props.role,
                            publicPage: props.publicPage,
                            pageData: props.pageData,
                        },
                        createElement(Cmp, null),
                    ),
                );
                setMessage("");
            } catch (error) {
                console.error("plugin ui import failed", url, error);
                if (cancelled) {
                    return;
                }
                if (props.webComponent) {
                    setWebComponent(props.webComponent);
                    setMessage("");
                    return;
                }
                setFailed(true);
                setMessage("Plugin UI failed to load");
            }
        }

        void load();
        return () => {
            cancelled = true;
            root?.unmount();
        };
    }, [
        props.entry,
        props.pluginId,
        props.version,
        props.webComponent,
        props.pageId,
        props.widgetId,
        props.role,
        props.publicPage,
        props.pageData,
    ]);

    return (
        <>
            {props.styles?.length ? (
                <div hidden>
                    {props.styles.map((href) => (
                        <link key={href} rel="stylesheet" href={pluginAssetUrl(props.pluginId, href, props.version)} />
                    ))}
                </div>
            ) : null}
            {failed && message ? <PluginErrorCard message={message} /> : null}
            {webComponent ? (
                <div
                    dangerouslySetInnerHTML={{
                        __html: `<${webComponent} data-plugin-id="${props.pluginId}"></${webComponent}>`,
                    }}
                />
            ) : (
                <div ref={hostRef} className="plugin-mount-root" />
            )}
        </>
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
