export const PLUGIN_API_VERSION = 1;
export const PLUGIN_STALE_AFTER_MS = 120_000;
export const PLUGIN_HEARTBEAT_MS = 15_000;
export const PLUGIN_FUTURE_SKEW_MS = 5 * 60_000;
export const PLUGIN_SDK_MAJOR = 1;

export const PLUGIN_UNITS = [
    "W",
    "Wh",
    "kWh",
    "%",
    "C",
    "ppm",
    "umol",
    "s",
    "enum",
    "1",
] as const;

export type PluginUnit = (typeof PLUGIN_UNITS)[number];

export type PluginRuntimeType = "python" | "node" | "docker" | "none";

export type PluginNavPlacement = "site" | "admin" | "none";

export type PluginWidgetSlot = "dashboard" | "overlay" | "plugin-page" | "energy-page" | "gallery-page";

export type PluginNetworkPermission = "none" | "lan" | "internet";

export type PluginMetricKind = "gauge" | "counter" | "enum";

export type PluginConfigFieldType = "string" | "integer" | "number" | "boolean" | "enum" | "secret";

export type PluginStatus =
    | "discovered"
    | "invalid"
    | "installed"
    | "enabled"
    | "healthy"
    | "stale"
    | "paused"
    | "disabled";

export type PluginPauseReason = "hash-mismatch" | "admin" | "invalid-manifest" | "runtime";

export type PluginConfigField = {
    type: PluginConfigFieldType;
    label?: string;
    required?: boolean;
    default?: string | number | boolean;
    min?: number;
    max?: number;
    values?: string[];
};

export type PluginMetricSpec = {
    unit: PluginUnit;
    kind: PluginMetricKind;
    min?: number | string;
    max?: number | string;
    sign?: string;
    values?: Record<string, string>;
};

export type PluginPageSpec = {
    id: string;
    path: string;
    title: string;
    nav: PluginNavPlacement;
    public?: boolean;
};

export type PluginWidgetSpec = {
    id: string;
    title: string;
    slots: PluginWidgetSlot[];
    size?: string;
};

export type PluginPermissions = {
    network: PluginNetworkPermission;
    publicPages?: boolean;
    media?: boolean;
};

export type PluginRuntimeSpec = {
    type: PluginRuntimeType;
    entry?: string;
    dockerfile?: string;
    image?: string;
    httpPort?: number;
    shmSize?: string;
    extraVolumes?: string[];
    extraEnv?: Record<string, string>;
    command?: string[];
};

export type PluginUiSpec = {
    entry: string;
    styles?: string[];
    sdk: string;
    webComponent?: string;
};

export type PluginExports = {
    liveClimate?: boolean;
    energy?: boolean;
    gallery?: boolean;
    broadcast?: boolean;
    overlayCapture?: boolean;
    tentEnergy?: boolean;
};

export type PluginCompat = {
    meshSettings?: boolean;
    meshState?: boolean;
};

export type PluginManifest = {
    id: string;
    name: string;
    author: string;
    version: string;
    apiVersion: number;
    description?: string;
    homepage?: string;
    repository?: string;
    license?: string;
    runtime?: PluginRuntimeSpec;
    ui?: PluginUiSpec;
    pages: PluginPageSpec[];
    widgets: PluginWidgetSpec[];
    permissions: PluginPermissions;
    config: Record<string, PluginConfigField>;
    metrics: Record<string, PluginMetricSpec>;
    exports?: PluginExports;
    compat?: PluginCompat;
    hostModule?: string;
};

export type DiscoveredPlugin = {
    folderName: string;
    folderPath: string;
    manifest: PluginManifest;
};

export type PluginRegistryRecord = {
    id: string;
    folderName: string;
    status: PluginStatus;
    pinnedHash: string | null;
    currentHash: string;
    hashMatches: boolean;
    enabledAt: string | null;
    installedAt: string | null;
    pausedReason: PluginPauseReason | null;
    pausedAt: string | null;
    versionAtInstall: string | null;
    permissionsAtInstall: PluginPermissions | null;
    tokenPresent: boolean;
};

export type PluginRegistryFile = {
    version: 1;
    plugins: Record<string, Omit<PluginRegistryRecord, "currentHash" | "hashMatches" | "tokenPresent">>;
};

export type PluginMetricSample = {
    value: number;
};

export type PluginIngestBody = {
    apiVersion: number;
    observedAt: string;
    metrics?: Record<string, PluginMetricSample>;
    state?: Record<string, unknown>;
};

export type PluginLiveMetric = {
    value: number | null;
    unit: PluginUnit;
    kind: PluginMetricKind;
    stale: boolean;
};

export type PluginLiveState = {
    pluginId: string;
    observedAt: string | null;
    stale: boolean;
    metrics: Record<string, PluginLiveMetric>;
    state: Record<string, unknown> | null;
};

export type PluginHeartbeat = {
    ok: boolean;
    status?: string;
    at: string;
};

export type PluginSeriesPoint = {
    t: string;
    value: number | null;
};

export type PluginHostModule = {
    onIngest?: (input: {
        pluginId: string;
        observedAt: string;
        metrics: Record<string, number | null>;
        state: Record<string, unknown> | null;
    }) => Promise<void> | void;
    fromMeshState?: (raw: unknown) => PluginIngestBody | {error: string};
    meshSettings?: () => Promise<Record<string, unknown>>;
    handleAction?: (request: Request, remainder: string) => Promise<Response>;
};

export const INSTALL_WARNING =
    "This plugin runs its own code on this server and in visitors' browsers. It can see what a logged-in admin sees. Install only plugins you trust.";
