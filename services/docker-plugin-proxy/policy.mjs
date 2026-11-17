/**
 * Allowlist for the GrowCast docker plugin proxy.
 * Only list/inspect/start/stop/restart/logs (and tightly checked create/delete)
 * of containers labeled growcast.plugin=<id>.
 */

export const PLUGIN_LABEL = "growcast.plugin";
export const PLUGIN_NAME = /^plugin-[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const PLUGIN_ID = /^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$/;
export const IMAGE_NAME = /^growcast-plugin-[a-z0-9-]+(?::[A-Za-z0-9._-]+)?$/;

const VERSION_PREFIX = /^\/v[\d.]+/;
const REFUSED_NAMES = new Set([
    "growcast",
    "docker-plugin-proxy",
    "docker-socket-proxy",
    "plugin-host",
    "host",
]);

export function stripEngineVersion(pathname) {
    const path = pathname.split("?")[0] || "/";
    const stripped = path.replace(VERSION_PREFIX, "");
    return stripped.startsWith("/") ? stripped : `/${stripped}`;
}

export function parseQuery(search) {
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    const out = {};
    for (const [key, value] of params.entries()) {
        out[key] = value;
    }
    return out;
}

export function defaultImageAllowlist(env = process.env) {
    const extra = (env.GROWCAST_PLUGIN_IMAGES ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    return new Set([
        "growcast-plugin-ggs:local",
        "growcast-plugin-timelapse:local",
        "growcast-plugin-restream:local",
        "growcast-plugin-solar:local",
        ...extra,
    ]);
}

export function imageAllowed(image, env = process.env) {
    if (typeof image !== "string" || !image.trim()) {
        return false;
    }
    const value = image.trim();
    if (value.includes("://") || value.includes("/") && !IMAGE_NAME.test(value)) {
        return false;
    }
    if (defaultImageAllowlist(env).has(value)) {
        return true;
    }
    return IMAGE_NAME.test(value);
}

export function hostProjectRoot(env = process.env) {
    const value = (env.GROWCAST_HOST_PROJECT ?? "").trim();
    return value.replace(/\/+$/, "");
}

export function pluginFolderFromId(pluginId) {
    const parts = pluginId.split(".");
    return parts[parts.length - 1] ?? pluginId;
}

function normalizeBind(bind) {
    const parts = String(bind).split(":");
    if (parts.length < 2) {
        return null;
    }
    const mode = parts.length >= 3 ? parts[parts.length - 1] : "";
    const dest = parts.length >= 3 ? parts[parts.length - 2] : parts[1];
    const source = parts.slice(0, parts.length - (parts.length >= 3 ? 2 : 1)).join(":");
    return {source, dest, mode};
}

export function bindAllowed(bind, pluginId, env = process.env) {
    const parsed = normalizeBind(bind);
    if (!parsed) {
        return false;
    }
    const root = hostProjectRoot(env);
    if (!root) {
        return false;
    }
    const folder = pluginFolderFromId(pluginId);
    const pluginSrc = `${root}/plugins/${folder}`;
    const dataSrc = `${root}/data/plugins/${pluginId}`;
    if (parsed.source === pluginSrc) {
        return parsed.dest === "/plugin" && parsed.mode === "ro";
    }
    if (parsed.source === dataSrc) {
        return parsed.dest === "/data" && (parsed.mode === "" || parsed.mode === "rw" || parsed.mode === "z");
    }
    return false;
}

export function networkModeAllowed(mode, env = process.env) {
    const value = (mode ?? "").trim();
    if (!value || value === "default" || value === "bridge") {
        return true;
    }
    if (value === "host" || value === "none" || value.startsWith("container:") || value.startsWith("ns:")) {
        return false;
    }
    const expected = (env.GROWCAST_PLUGIN_NETWORK ?? "").trim();
    if (expected && value === expected) {
        return true;
    }
    return /^[a-z0-9][a-z0-9_-]{0,63}$/.test(value) && value !== "host";
}

export function containerLabeled(inspect) {
    const labels = inspect?.Config?.Labels ?? inspect?.Labels ?? {};
    const pluginId = labels[PLUGIN_LABEL];
    return typeof pluginId === "string" && PLUGIN_ID.test(pluginId) ? pluginId : null;
}

export function isPluginContainerName(name) {
    return PLUGIN_NAME.test(name) && !REFUSED_NAMES.has(name);
}

function deny(reason) {
    return {allow: false, reason};
}

function allow(note) {
    return {allow: true, note};
}

/**
 * @param {{method: string, pathname: string, search?: string, body?: unknown}} request
 * @param {{env?: NodeJS.ProcessEnv, inspect?: (id: string) => Promise<unknown>}} ctx
 */
export async function authorizeDockerRequest(request, ctx = {}) {
    const env = ctx.env ?? process.env;
    const method = request.method.toUpperCase();
    const pathname = stripEngineVersion(request.pathname);
    const search = request.search ?? "";
    const query = parseQuery(search);

    if (method === "GET" && (pathname === "/_ping" || pathname === "/version")) {
        return allow("ping");
    }

    if (method === "GET" && pathname === "/containers/json") {
        return {allow: true, note: "list", forceLabelFilter: true};
    }

    const createMatch = pathname === "/containers/create";
    if (method === "POST" && createMatch) {
        return authorizeCreate(query.name, request.body, env);
    }

    const containerMatch = /^\/containers\/([^/]+)(?:\/(.*))?$/.exec(pathname);
    if (!containerMatch) {
        return deny(`denied ${method} ${pathname}`);
    }
    const id = decodeURIComponent(containerMatch[1] ?? "");
    const rest = containerMatch[2] ?? "";

    if (!id || id.includes("/") || id.includes("..")) {
        return deny("invalid container id");
    }

    const inspectFn = ctx.inspect;
    if (typeof inspectFn !== "function") {
        return deny("inspect unavailable");
    }
    let inspect;
    try {
        inspect = await inspectFn(id);
    } catch (error) {
        if (error && error.status === 404) {
            return deny("unknown container");
        }
        return deny("inspect failed");
    }
    const pluginId = containerLabeled(inspect);
    if (!pluginId) {
        return deny("container is not a labeled plugin");
    }
    const names = [
        inspect.Name?.replace(/^\//, ""),
        ...(inspect.Names ?? []).map((name) => String(name).replace(/^\//, "")),
    ].filter(Boolean);
    if (names.some((name) => !isPluginContainerName(name) && name !== id)) {
        return deny("container name is not a plugin target");
    }

    if (method === "GET" && (rest === "json" || rest === "")) {
        return allow("inspect");
    }
    if (method === "GET" && rest === "logs") {
        return allow("logs");
    }
    if (method === "POST" && rest === "start") {
        return allow("start");
    }
    if (method === "POST" && rest === "stop") {
        return allow("stop");
    }
    if (method === "POST" && rest === "restart") {
        return allow("restart");
    }
    if (method === "DELETE" && rest === "") {
        return allow("delete labeled plugin container");
    }
    return deny(`denied ${method} /containers/${id}/${rest}`);
}

export function authorizeCreate(name, body, env = process.env) {
    if (!isPluginContainerName(name ?? "")) {
        return deny("create name must be plugin-<id>");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return deny("create body must be an object");
    }
    const image = body.Image;
    if (!imageAllowed(image, env)) {
        return deny("image is not on the plugin allowlist");
    }
    const labels = body.Labels && typeof body.Labels === "object" ? body.Labels : {};
    const pluginId = labels[PLUGIN_LABEL];
    if (typeof pluginId !== "string" || !PLUGIN_ID.test(pluginId)) {
        return deny("missing growcast.plugin label");
    }
    const expectedName = `plugin-${pluginId.replace(/\./g, "-")}`;
    if (name !== expectedName) {
        return deny("container name does not match plugin id");
    }
    if (body.HostConfig && typeof body.HostConfig !== "object") {
        return deny("invalid HostConfig");
    }
    const host = body.HostConfig ?? {};
    if (host.Privileged === true) {
        return deny("privileged is not allowed");
    }
    if (Array.isArray(host.CapAdd) && host.CapAdd.length > 0) {
        return deny("added capabilities are not allowed");
    }
    if (Array.isArray(host.Devices) && host.Devices.length > 0) {
        return deny("device mounts are not allowed");
    }
    if (host.PidMode && host.PidMode !== "") {
        return deny("pid namespace mode is not allowed");
    }
    if (!networkModeAllowed(host.NetworkMode, env)) {
        return deny("network mode is not allowed");
    }
    if (Array.isArray(host.Binds)) {
        for (const bind of host.Binds) {
            if (!bindAllowed(bind, pluginId, env)) {
                return deny(`bind not allowed: ${bind}`);
            }
        }
    }
    if (Array.isArray(host.Mounts) && host.Mounts.length > 0) {
        return deny("Mounts are not allowed; use Binds");
    }
    if (typeof body.Volumes === "object" && body.Volumes && Object.keys(body.Volumes).length > 0) {
        return deny("named volumes are not allowed");
    }
    return allow("create");
}

export const DENIED_PREFIXES = [
    "/exec",
    "/images",
    "/networks",
    "/volumes",
    "/build",
    "/commit",
    "/swarm",
    "/plugins",
    "/services",
    "/tasks",
    "/secrets",
    "/configs",
    "/distribution",
    "/session",
    "/grpc",
    "/auth",
    "/system",
    "/events",
    "/containers/prune",
];
