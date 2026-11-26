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

const CONTENT_HASH = /^sha256:[a-f0-9]{64}$/;

export function pluginAssetVersion(hash: string | null | undefined, fallback: string): string {
    if (hash && CONTENT_HASH.test(hash)) {
        return hash;
    }
    return fallback;
}

export function pluginAssetCacheControl(version: string): string {
    if (CONTENT_HASH.test(version)) {
        return "public, max-age=31536000, immutable";
    }
    return "no-cache";
}

export function pluginAssetUrl(pluginId: string, entry: string, version: string): string {
    return `/plugin-assets/${encodeURIComponent(pluginId)}/${encodeURIComponent(version)}/${entry.replace(/^\/+/, "")}`;
}
