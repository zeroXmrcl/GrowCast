import {isRecord} from "@/lib/coerce";
import {isFirstPartyPluginId, isPluginId, isReservedPluginId} from "@/lib/plugins/ids";
import {parseSemver, satisfiesSdkRange} from "@/lib/plugins/semver";
import {isPluginUnit} from "@/lib/plugins/units";
import {
    PLUGIN_API_VERSION,
    PLUGIN_SDK_MAJOR,
    type PluginCompat,
    type PluginConfigField,
    type PluginConfigFieldType,
    type PluginExports,
    type PluginInstallerSpec,
    type PluginManifest,
    type PluginMetricSpec,
    type PluginNavPlacement,
    type PluginNetworkPermission,
    type PluginPageSpec,
    type PluginPermissions,
    type PluginRuntimeSpec,
    type PluginRuntimeType,
    type PluginUiSpec,
    type PluginWidgetSlot,
    type PluginWidgetSpec,
} from "@/lib/plugins/types";

export type ManifestResult =
    | {ok: true; value: PluginManifest}
    | {ok: false; error: string};

const RUNTIME_TYPES = new Set<PluginRuntimeType>(["python", "node", "docker", "none"]);
const NAV = new Set<PluginNavPlacement>(["site", "admin", "none"]);
const SLOTS = new Set<PluginWidgetSlot>([
    "dashboard",
    "overlay",
    "plugin-page",
    "energy-page",
    "gallery-page",
    "archive",
    "site-chrome",
]);
const NETWORK = new Set<PluginNetworkPermission>(["none", "lan", "internet"]);
const METRIC_KINDS = new Set(["gauge", "counter", "enum"]);
const CONFIG_TYPES = new Set(["string", "integer", "number", "boolean", "enum", "secret"]);

function asTrimmed(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalString(value: unknown): string | undefined {
    if (value === undefined) {
        return undefined;
    }
    const text = asTrimmed(value);
    return text ?? undefined;
}

function parseRuntime(raw: unknown): PluginRuntimeSpec | undefined | string {
    if (raw === undefined) {
        return undefined;
    }
    if (!isRecord(raw)) {
        return "runtime must be an object";
    }
    const type = asTrimmed(raw.type);
    if (!type || !RUNTIME_TYPES.has(type as PluginRuntimeType)) {
        return "runtime.type must be python, node, docker, or none";
    }
    return {
        type: type as PluginRuntimeType,
        entry: optionalString(raw.entry),
        dockerfile: optionalString(raw.dockerfile),
        image: optionalString(raw.image),
        httpPort: typeof raw.httpPort === "number" && Number.isInteger(raw.httpPort) ? raw.httpPort : undefined,
        shmSize: optionalString(raw.shmSize),
        extraVolumes: Array.isArray(raw.extraVolumes)
            ? raw.extraVolumes.filter((item): item is string => typeof item === "string")
            : undefined,
        extraEnv: isRecord(raw.extraEnv)
            ? Object.fromEntries(
                Object.entries(raw.extraEnv).filter((entry): entry is [string, string] =>
                    typeof entry[1] === "string",
                ),
            )
            : undefined,
        command: Array.isArray(raw.command)
            ? raw.command.filter((item): item is string => typeof item === "string")
            : undefined,
    };
}

function parseUi(raw: unknown): PluginUiSpec | undefined | string {
    if (raw === undefined) {
        return undefined;
    }
    if (!isRecord(raw)) {
        return "ui must be an object";
    }
    const entry = asTrimmed(raw.entry);
    const sdk = asTrimmed(raw.sdk);
    if (!entry) {
        return "ui.entry is required";
    }
    if (!sdk || !satisfiesSdkRange(sdk, PLUGIN_SDK_MAJOR)) {
        return `ui.sdk must be a range for SDK major ${PLUGIN_SDK_MAJOR} (e.g. ^1.0.0)`;
    }
    const styles = Array.isArray(raw.styles)
        ? raw.styles.filter((item): item is string => typeof item === "string")
        : undefined;
    return {
        entry,
        styles,
        sdk,
        webComponent: optionalString(raw.webComponent),
    };
}

function parsePages(raw: unknown): PluginPageSpec[] | string {
    if (raw === undefined) {
        return [];
    }
    if (!Array.isArray(raw)) {
        return "pages must be an array";
    }
    const pages: PluginPageSpec[] = [];
    const ids = new Set<string>();
    for (const item of raw) {
        if (!isRecord(item)) {
            return "each page must be an object";
        }
        const id = asTrimmed(item.id);
        const title = asTrimmed(item.title);
        const nav = asTrimmed(item.nav) as PluginNavPlacement | null;
        if (!id || !title || !nav || !NAV.has(nav)) {
            return "page requires id, title, and nav (site|admin|none)";
        }
        if (ids.has(id)) {
            return `duplicate page id "${id}"`;
        }
        ids.add(id);
        const pathValue = typeof item.path === "string" ? item.path.replace(/^\/+/, "") : "";
        const bands = Array.isArray(item.bands)
            ? item.bands.flatMap((band) => {
                if (!isRecord(band)) {
                    return [];
                }
                const bandId = asTrimmed(band.id);
                const label = asTrimmed(band.label);
                return bandId && label ? [{id: bandId, label}] : [];
            })
            : undefined;
        pages.push({
            id,
            path: pathValue,
            title,
            nav,
            public: item.public === true,
            shell: item.shell === "none" ? "none" : "site",
            viewport: item.viewport === "broadcast" ? "broadcast" : "site",
            ...(bands && bands.length > 0 ? {bands} : {}),
        });
    }
    return pages;
}

function parseWidgets(raw: unknown): PluginWidgetSpec[] | string {
    if (raw === undefined) {
        return [];
    }
    if (!Array.isArray(raw)) {
        return "widgets must be an array";
    }
    const widgets: PluginWidgetSpec[] = [];
    const ids = new Set<string>();
    for (const item of raw) {
        if (!isRecord(item)) {
            return "each widget must be an object";
        }
        const id = asTrimmed(item.id);
        const title = asTrimmed(item.title);
        if (!id || !title || !Array.isArray(item.slots)) {
            return "widget requires id, title, and slots";
        }
        if (ids.has(id)) {
            return `duplicate widget id "${id}"`;
        }
        ids.add(id);
        const slots = item.slots.filter((slot): slot is PluginWidgetSlot =>
            typeof slot === "string" && SLOTS.has(slot as PluginWidgetSlot),
        );
        if (slots.length === 0) {
            return `widget "${id}" has no valid slots`;
        }
        widgets.push({
            id,
            title,
            slots,
            size: optionalString(item.size),
        });
    }
    return widgets;
}

function parsePermissions(raw: unknown): PluginPermissions | string {
    if (!isRecord(raw)) {
        return "permissions is required";
    }
    const network = asTrimmed(raw.network);
    if (!network || !NETWORK.has(network as PluginNetworkPermission)) {
        return "permissions.network must be none, lan, or internet";
    }
    return {
        network: network as PluginNetworkPermission,
        publicPages: raw.publicPages === true,
        media: raw.media === true,
    };
}

function parseConfig(raw: unknown): Record<string, PluginConfigField> | string {
    if (raw === undefined) {
        return {};
    }
    if (!isRecord(raw)) {
        return "config must be an object";
    }
    const config: Record<string, PluginConfigField> = {};
    for (const [key, value] of Object.entries(raw)) {
        if (!isRecord(value)) {
            return `config.${key} must be an object`;
        }
        const type = asTrimmed(value.type);
        if (!type || !CONFIG_TYPES.has(type)) {
            return `config.${key}.type is invalid`;
        }
        config[key] = {
            type: type as PluginConfigFieldType,
            label: optionalString(value.label),
            required: value.required === true,
            default: typeof value.default === "string"
                || typeof value.default === "number"
                || typeof value.default === "boolean"
                ? value.default
                : undefined,
            min: typeof value.min === "number" ? value.min : undefined,
            max: typeof value.max === "number" ? value.max : undefined,
            values: Array.isArray(value.values)
                ? value.values.filter((item): item is string => typeof item === "string")
                : undefined,
        };
    }
    return config;
}

function parseMetrics(raw: unknown): Record<string, PluginMetricSpec> | string {
    if (raw === undefined) {
        return {};
    }
    if (!isRecord(raw)) {
        return "metrics must be an object";
    }
    const metrics: Record<string, PluginMetricSpec> = {};
    for (const [key, value] of Object.entries(raw)) {
        if (!/^[a-z][a-z0-9_.]*$/.test(key)) {
            return `metric key "${key}" is invalid`;
        }
        if (!isRecord(value)) {
            return `metrics.${key} must be an object`;
        }
        const unit = asTrimmed(value.unit);
        const kind = asTrimmed(value.kind) ?? "gauge";
        if (!unit || !isPluginUnit(unit)) {
            return `metrics.${key} has an unknown unit`;
        }
        if (!METRIC_KINDS.has(kind)) {
            return `metrics.${key}.kind must be gauge, counter, or enum`;
        }
        const enumValues = isRecord(value.values)
            ? Object.fromEntries(
                Object.entries(value.values).filter((entry): entry is [string, string] =>
                    typeof entry[1] === "string",
                ),
            )
            : undefined;
        metrics[key] = {
            unit,
            kind: kind as PluginMetricSpec["kind"],
            min: typeof value.min === "number" || typeof value.min === "string" ? value.min : undefined,
            max: typeof value.max === "number" || typeof value.max === "string" ? value.max : undefined,
            sign: optionalString(value.sign),
            values: enumValues,
        };
    }
    return metrics;
}

function parseExports(raw: unknown): PluginExports | undefined | string {
    if (raw === undefined) {
        return undefined;
    }
    if (!isRecord(raw)) {
        return "exports must be an object";
    }
    return {
        liveClimate: raw.liveClimate === true,
        energy: raw.energy === true,
        gallery: raw.gallery === true,
        broadcast: raw.broadcast === true,
        overlayCapture: raw.overlayCapture === true,
        tentEnergy: raw.tentEnergy === true,
    };
}

function parseInstaller(raw: unknown): PluginInstallerSpec | undefined | string {
    if (raw === undefined) {
        return undefined;
    }
    if (!isRecord(raw)) {
        return "installer must be an object";
    }
    const stepId = asTrimmed(raw.stepId);
    const label = asTrimmed(raw.label);
    const title = asTrimmed(raw.title);
    const line = asTrimmed(raw.line);
    const sort = typeof raw.sort === "number" && Number.isFinite(raw.sort) ? raw.sort : null;
    if (!stepId || !label || !title || !line || sort === null) {
        return "installer requires stepId, sort, label, title, and line";
    }
    return {stepId, sort, label, title, line};
}

function parseCompat(raw: unknown): PluginCompat | undefined | string {
    if (raw === undefined) {
        return undefined;
    }
    if (!isRecord(raw)) {
        return "compat must be an object";
    }
    return {
        meshSettings: raw.meshSettings === true,
        meshState: raw.meshState === true,
    };
}

export function parsePluginManifest(raw: unknown): ManifestResult {
    if (!isRecord(raw)) {
        return {ok: false, error: "plugin.json must be an object"};
    }
    const id = asTrimmed(raw.id);
    const name = asTrimmed(raw.name);
    const author = asTrimmed(raw.author);
    const version = asTrimmed(raw.version);
    if (!id || !isPluginId(id)) {
        return {ok: false, error: "id must be reverse-DNS (e.g. growcast.solar)"};
    }
    if (isReservedPluginId(id) && !isFirstPartyPluginId(id)) {
        return {ok: false, error: "growcast.* is reserved for first-party plugins"};
    }
    if (!name || !author) {
        return {ok: false, error: "name and author are required"};
    }
    if (!version || !parseSemver(version)) {
        return {ok: false, error: "version must be semver (e.g. 0.1.0)"};
    }
    if (raw.apiVersion !== PLUGIN_API_VERSION) {
        return {ok: false, error: `apiVersion must be ${PLUGIN_API_VERSION}`};
    }
    const runtime = parseRuntime(raw.runtime);
    if (typeof runtime === "string") {
        return {ok: false, error: runtime};
    }
    const ui = parseUi(raw.ui);
    if (typeof ui === "string") {
        return {ok: false, error: ui};
    }
    const pages = parsePages(raw.pages);
    if (typeof pages === "string") {
        return {ok: false, error: pages};
    }
    const widgets = parseWidgets(raw.widgets);
    if (typeof widgets === "string") {
        return {ok: false, error: widgets};
    }
    const permissions = parsePermissions(raw.permissions);
    if (typeof permissions === "string") {
        return {ok: false, error: permissions};
    }
    const config = parseConfig(raw.config);
    if (typeof config === "string") {
        return {ok: false, error: config};
    }
    const metrics = parseMetrics(raw.metrics);
    if (typeof metrics === "string") {
        return {ok: false, error: metrics};
    }
    const exports = parseExports(raw.exports);
    if (typeof exports === "string") {
        return {ok: false, error: exports};
    }
    const compat = parseCompat(raw.compat);
    if (typeof compat === "string") {
        return {ok: false, error: compat};
    }
    const installer = parseInstaller(raw.installer);
    if (typeof installer === "string") {
        return {ok: false, error: installer};
    }
    for (const page of pages) {
        if (page.public && !permissions.publicPages) {
            return {ok: false, error: `page "${page.id}" is public but permissions.publicPages is not set`};
        }
    }
    return {
        ok: true,
        value: {
            id,
            name,
            author,
            version,
            apiVersion: PLUGIN_API_VERSION,
            description: optionalString(raw.description),
            homepage: optionalString(raw.homepage),
            repository: optionalString(raw.repository),
            license: optionalString(raw.license),
            runtime,
            ui,
            pages,
            widgets,
            permissions,
            config,
            metrics,
            exports,
            compat,
            installer,
            hostModule: optionalString(raw.hostModule),
        },
    };
}
