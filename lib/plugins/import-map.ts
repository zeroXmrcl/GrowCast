export const PLUGIN_IMPORT_MAP = {
    imports: {
        react: "/plugin-runtime/react.js",
        "react/jsx-runtime": "/plugin-runtime/jsx-runtime.js",
        "react-dom": "/plugin-runtime/react-dom.js",
        "react-dom/client": "/plugin-runtime/react-dom-client.js",
        "@growcast/plugin-sdk/ui": "/plugin-runtime/plugin-sdk-ui.js",
    },
};

export function pluginImportMapJson(): string {
    return JSON.stringify(PLUGIN_IMPORT_MAP);
}

export function pluginAssetUrl(pluginId: string, entry: string, version: string): string {
    return `/plugin-assets/${encodeURIComponent(pluginId)}/${encodeURIComponent(version)}/${entry.replace(/^\/+/, "")}`;
}
