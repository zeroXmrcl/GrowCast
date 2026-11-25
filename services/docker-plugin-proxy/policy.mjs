/**
 * Allowlist for the GrowCast docker plugin proxy.
 * Only list/inspect/start/stop/restart/logs (and tightly checked create/delete)
 * of containers labeled growcast.plugin=<id>.
 *
 * Docker's Engine API decodes JSON field names case-insensitively and lets the
 * last duplicate win. This module rejects case-variant and exact duplicate keys
 * and forwards only a canonical allowlisted create body.
 */

import {timingSafeEqual} from "node:crypto";

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

const TOP_KEYS = {
    image: "Image",
    labels: "Labels",
    user: "User",
    env: "Env",
    cmd: "Cmd",
    workingdir: "WorkingDir",
    entrypoint: "Entrypoint",
    hostconfig: "HostConfig",
    volumes: "Volumes",
    networkingconfig: "NetworkingConfig",
};

const HOST_KEYS = {
    binds: "Binds",
    networkmode: "NetworkMode",
    restartpolicy: "RestartPolicy",
    shmsize: "ShmSize",
    readonlyrootfs: "ReadonlyRootfs",
    init: "Init",
    privileged: "Privileged",
    capadd: "CapAdd",
    devices: "Devices",
    devicerequests: "DeviceRequests",
    devicecgrouprules: "DeviceCgroupRules",
    pidmode: "PidMode",
    ipcmode: "IpcMode",
    cgroupnsmode: "CgroupnsMode",
    usernsmode: "UsernsMode",
    utsmode: "UTSMode",
    securityopt: "SecurityOpt",
    mounts: "Mounts",
    volumesfrom: "VolumesFrom",
    groupadd: "GroupAdd",
    sysctls: "Sysctls",
    publishallports: "PublishAllPorts",
    portbindings: "PortBindings",
    links: "Links",
    runtime: "Runtime",
    cgroupparent: "CgroupParent",
    maskedpaths: "MaskedPaths",
    readonlypaths: "ReadonlyPaths",
    tmpfs: "Tmpfs",
    extrahosts: "ExtraHosts",
    annotations: "Annotations",
    storageopt: "StorageOpt",
};

const RESTART_KEYS = {
    name: "Name",
    maximumretrycount: "MaximumRetryCount",
};

const RESTART_NAMES = new Set(["no", "always", "on-failure", "unless-stopped"]);
const MAX_SHM = 8 * 1024 * 1024 * 1024;

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
    const folded = value.toLowerCase();
    if (!value || folded === "default" || folded === "bridge") {
        return true;
    }
    if (folded === "host" || folded === "none" || folded.startsWith("container:") || folded.startsWith("ns:")) {
        return false;
    }
    const expected = (env.GROWCAST_PLUGIN_NETWORK ?? "").trim();
    if (expected && value === expected) {
        return true;
    }
    return /^[a-z0-9][a-z0-9_-]{0,63}$/.test(value) && folded !== "host";
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

function allow(note, extra = {}) {
    return {allow: true, note, ...extra};
}

function foldKey(key) {
    let out = "";
    for (let index = 0; index < key.length; index += 1) {
        const code = key.charCodeAt(index);
        out += code >= 65 && code <= 90 ? String.fromCharCode(code + 32) : key[index];
    }
    return out;
}

function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * ASCII case-fold used by Docker's encoding/json for field names.
 * Duplicate keys that differ only by case are rejected at every object.
 */
export function parseStrictJson(text) {
    if (typeof text !== "string") {
        return {ok: false, reason: "invalid json"};
    }
    try {
        assertNoCaseDuplicateKeys(text);
    } catch (error) {
        const reason = error instanceof Error ? error.message : "invalid json";
        return {ok: false, reason};
    }
    try {
        return {ok: true, value: JSON.parse(text)};
    } catch {
        return {ok: false, reason: "invalid json"};
    }
}

function assertNoCaseDuplicateKeys(text) {
    let index = 0;
    const length = text.length;

    function skipWs() {
        while (index < length && (text[index] === " " || text[index] === "\n" || text[index] === "\r" || text[index] === "\t")) {
            index += 1;
        }
    }

    function fail(reason) {
        throw new Error(reason);
    }

    function parseString() {
        if (text[index] !== "\"") {
            fail("invalid json");
        }
        index += 1;
        let out = "";
        while (index < length) {
            const char = text[index];
            index += 1;
            if (char === "\"") {
                return out;
            }
            if (char === "\\") {
                const esc = text[index];
                index += 1;
                if (esc === "\"" || esc === "\\" || esc === "/") {
                    out += esc;
                } else if (esc === "b") {
                    out += "\b";
                } else if (esc === "f") {
                    out += "\f";
                } else if (esc === "n") {
                    out += "\n";
                } else if (esc === "r") {
                    out += "\r";
                } else if (esc === "t") {
                    out += "\t";
                } else if (esc === "u") {
                    const hex = text.slice(index, index + 4);
                    if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
                        fail("invalid json");
                    }
                    index += 4;
                    out += String.fromCharCode(Number.parseInt(hex, 16));
                } else {
                    fail("invalid json");
                }
            } else if (char.charCodeAt(0) < 0x20) {
                fail("invalid json");
            } else {
                out += char;
            }
        }
        fail("invalid json");
        return out;
    }

    function skipNumber() {
        const start = index;
        if (text[index] === "-") {
            index += 1;
        }
        if (text[index] === "0") {
            index += 1;
        } else if (text[index] >= "1" && text[index] <= "9") {
            while (text[index] >= "0" && text[index] <= "9") {
                index += 1;
            }
        } else {
            fail("invalid json");
        }
        if (text[index] === ".") {
            index += 1;
            if (!(text[index] >= "0" && text[index] <= "9")) {
                fail("invalid json");
            }
            while (text[index] >= "0" && text[index] <= "9") {
                index += 1;
            }
        }
        if (text[index] === "e" || text[index] === "E") {
            index += 1;
            if (text[index] === "+" || text[index] === "-") {
                index += 1;
            }
            if (!(text[index] >= "0" && text[index] <= "9")) {
                fail("invalid json");
            }
            while (text[index] >= "0" && text[index] <= "9") {
                index += 1;
            }
        }
        JSON.parse(text.slice(start, index));
    }

    function parseValue(depth) {
        if (depth > 32) {
            fail("invalid json");
        }
        skipWs();
        const char = text[index];
        if (char === "{") {
            return parseObject(depth + 1);
        }
        if (char === "[") {
            return parseArray(depth + 1);
        }
        if (char === "\"") {
            parseString();
            return;
        }
        if (char === "-" || (char >= "0" && char <= "9")) {
            skipNumber();
            return;
        }
        if (text.startsWith("true", index)) {
            index += 4;
            return;
        }
        if (text.startsWith("false", index)) {
            index += 5;
            return;
        }
        if (text.startsWith("null", index)) {
            index += 4;
            return;
        }
        fail("invalid json");
    }

    function parseObject(depth) {
        index += 1;
        skipWs();
        const seen = new Set();
        if (text[index] === "}") {
            index += 1;
            return;
        }
        while (index < length) {
            skipWs();
            const key = parseString();
            const folded = foldKey(key);
            if (seen.has(folded) || seen.has(key)) {
                fail(`duplicate key ${key}`);
            }
            seen.add(folded);
            seen.add(key);
            skipWs();
            if (text[index] !== ":") {
                fail("invalid json");
            }
            index += 1;
            parseValue(depth);
            skipWs();
            if (text[index] === ",") {
                index += 1;
                continue;
            }
            if (text[index] === "}") {
                index += 1;
                return;
            }
            fail("invalid json");
        }
        fail("invalid json");
    }

    function parseArray(depth) {
        index += 1;
        skipWs();
        if (text[index] === "]") {
            index += 1;
            return;
        }
        while (index < length) {
            parseValue(depth);
            skipWs();
            if (text[index] === ",") {
                index += 1;
                continue;
            }
            if (text[index] === "]") {
                index += 1;
                return;
            }
            fail("invalid json");
        }
        fail("invalid json");
    }

    skipWs();
    parseValue(0);
    skipWs();
    if (index !== length) {
        fail("invalid json");
    }
}

function takeKeys(value, table, label) {
    if (!isObject(value)) {
        return {ok: false, reason: `${label} must be an object`};
    }
    const seen = new Set();
    const out = {};
    for (const key of Object.keys(value)) {
        if (key === "__proto__" || key === "constructor" || key === "prototype") {
            return {ok: false, reason: `refused key ${key}`};
        }
        const folded = foldKey(key);
        if (seen.has(folded)) {
            return {ok: false, reason: `duplicate key ${key}`};
        }
        seen.add(folded);
        const canonical = table[folded];
        if (!canonical) {
            return {ok: false, reason: `unknown key ${key}`};
        }
        out[canonical] = value[key];
    }
    return {ok: true, value: out};
}

function stringList(value, label) {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
        return {ok: false, reason: `${label} must be an array of strings`};
    }
    return {ok: true, value};
}

function emptyOrAbsent(value) {
    if (value === undefined) {
        return true;
    }
    if (Array.isArray(value)) {
        return value.length === 0;
    }
    if (isObject(value)) {
        return Object.keys(value).length === 0;
    }
    return false;
}

function namespaceModeDenied(value, label) {
    if (value === undefined || value === "") {
        return null;
    }
    if (typeof value !== "string") {
        return `${label} is not allowed`;
    }
    if (value.trim() !== "") {
        return `${label} is not allowed`;
    }
    return null;
}

function securityOptDenied(value) {
    if (value === undefined) {
        return null;
    }
    if (!Array.isArray(value)) {
        return "security options are not allowed";
    }
    if (value.length === 0) {
        return null;
    }
    const unsafe = value.some((item) => {
        const text = String(item).toLowerCase();
        return text.includes("unconfined")
            || text.includes("label=disable")
            || text.includes("label:disable")
            || /no-new-privileges(?:=|:)\s*false/.test(text);
    });
    return unsafe ? "unconfined security options are not allowed" : "security options are not allowed";
}

export function normalizeCreateBody(body, env = process.env) {
    if (!isObject(body)) {
        return {ok: false, reason: "create body must be an object"};
    }
    const top = takeKeys(body, TOP_KEYS, "create body");
    if (!top.ok) {
        return top;
    }
    const out = {};
    if (typeof top.value.Image !== "string") {
        return {ok: false, reason: "image is not on the plugin allowlist"};
    }
    out.Image = top.value.Image.trim();
    if (top.value.User !== undefined) {
        if (typeof top.value.User !== "string" || top.value.User.includes("\0") || top.value.User.length > 64) {
            return {ok: false, reason: "invalid User"};
        }
        out.User = top.value.User;
    }
    if (top.value.Env !== undefined) {
        const env = stringList(top.value.Env, "Env");
        if (!env.ok) {
            return env;
        }
        out.Env = env.value;
    }
    if (top.value.Cmd !== undefined) {
        const cmd = stringList(top.value.Cmd, "Cmd");
        if (!cmd.ok) {
            return cmd;
        }
        out.Cmd = cmd.value;
    }
    if (top.value.Entrypoint !== undefined && top.value.Entrypoint !== null) {
        const entry = stringList(top.value.Entrypoint, "Entrypoint");
        if (!entry.ok) {
            return entry;
        }
        out.Entrypoint = entry.value;
    }
    if (top.value.WorkingDir !== undefined) {
        if (typeof top.value.WorkingDir !== "string" || top.value.WorkingDir.includes("\0")) {
            return {ok: false, reason: "invalid WorkingDir"};
        }
        out.WorkingDir = top.value.WorkingDir;
    }
    if (!isObject(top.value.Labels)) {
        return {ok: false, reason: "missing growcast.plugin label"};
    }
    const labels = {};
    const seenLabels = new Set();
    for (const key of Object.keys(top.value.Labels)) {
        const folded = foldKey(key);
        if (seenLabels.has(folded)) {
            return {ok: false, reason: `duplicate key ${key}`};
        }
        seenLabels.add(folded);
        const labelValue = top.value.Labels[key];
        if (typeof labelValue !== "string") {
            return {ok: false, reason: "label values must be strings"};
        }
        labels[key] = labelValue;
    }
    out.Labels = labels;
    if (top.value.Volumes !== undefined && !emptyOrAbsent(top.value.Volumes)) {
        return {ok: false, reason: "named volumes are not allowed"};
    }
    if (top.value.NetworkingConfig !== undefined && !emptyOrAbsent(top.value.NetworkingConfig)) {
        return {ok: false, reason: "NetworkingConfig is not allowed"};
    }
    if (top.value.HostConfig === undefined) {
        out.HostConfig = {};
        return {ok: true, value: out};
    }
    const host = takeKeys(top.value.HostConfig, HOST_KEYS, "HostConfig");
    if (!host.ok) {
        return host;
    }
    const hostOut = {};
    if (host.value.Privileged !== undefined && host.value.Privileged !== false) {
        return {ok: false, reason: "privileged is not allowed"};
    }
    if (host.value.Privileged === false) {
        hostOut.Privileged = false;
    }
    if (host.value.CapAdd !== undefined && !emptyOrAbsent(host.value.CapAdd)) {
        return {ok: false, reason: "added capabilities are not allowed"};
    }
    if (Array.isArray(host.value.CapAdd)) {
        hostOut.CapAdd = [];
    }
    if (host.value.Devices !== undefined && !emptyOrAbsent(host.value.Devices)) {
        return {ok: false, reason: "device mounts are not allowed"};
    }
    if (Array.isArray(host.value.Devices)) {
        hostOut.Devices = [];
    }
    for (const [key, reason] of [
        ["DeviceRequests", "device mounts are not allowed"],
        ["DeviceCgroupRules", "device mounts are not allowed"],
        ["Mounts", "Mounts are not allowed; use Binds"],
        ["VolumesFrom", "host mounts are not allowed"],
        ["GroupAdd", "added groups are not allowed"],
        ["Sysctls", "sysctls are not allowed"],
        ["Links", "container links are not allowed"],
        ["Tmpfs", "tmpfs mounts are not allowed"],
        ["ExtraHosts", "extra hosts are not allowed"],
        ["Annotations", "runtime annotations are not allowed"],
        ["StorageOpt", "storage options are not allowed"],
    ]) {
        if (host.value[key] !== undefined && !emptyOrAbsent(host.value[key])) {
            return {ok: false, reason};
        }
    }
    if (host.value.MaskedPaths !== undefined || host.value.ReadonlyPaths !== undefined) {
        return {ok: false, reason: "clearing default masked paths is not allowed"};
    }
    const security = securityOptDenied(host.value.SecurityOpt);
    if (security) {
        return {ok: false, reason: security};
    }
    const pid = namespaceModeDenied(host.value.PidMode, "pid namespace mode");
    if (pid) {
        return {ok: false, reason: pid};
    }
    if (host.value.PidMode === "") {
        hostOut.PidMode = "";
    }
    const ipc = namespaceModeDenied(host.value.IpcMode, "ipc namespace mode");
    if (ipc) {
        return {ok: false, reason: ipc};
    }
    for (const [key, label] of [
        ["CgroupnsMode", "cgroup namespace mode"],
        ["UsernsMode", "user namespace mode"],
        ["UTSMode", "uts namespace mode"],
    ]) {
        const mode = host.value[key];
        if (mode === undefined || mode === "") {
            continue;
        }
        if (typeof mode !== "string" || mode.trim().toLowerCase() === "host" || mode.trim() !== "" && key !== "CgroupnsMode") {
            return {ok: false, reason: `${label} is not allowed`};
        }
        if (key === "CgroupnsMode" && mode.trim().toLowerCase() !== "private") {
            return {ok: false, reason: `${label} is not allowed`};
        }
    }
    if (host.value.PublishAllPorts === true) {
        return {ok: false, reason: "publishing all ports is not allowed"};
    }
    if (host.value.PortBindings !== undefined && !emptyOrAbsent(host.value.PortBindings)) {
        return {ok: false, reason: "port bindings are not allowed"};
    }
    if (host.value.Runtime !== undefined && host.value.Runtime !== "") {
        return {ok: false, reason: "custom runtime is not allowed"};
    }
    if (host.value.CgroupParent !== undefined && host.value.CgroupParent !== "") {
        return {ok: false, reason: "cgroup parent is not allowed"};
    }
    if (host.value.NetworkMode !== undefined) {
        if (typeof host.value.NetworkMode !== "string" || !networkModeAllowed(host.value.NetworkMode, env)) {
            return {ok: false, reason: "network mode is not allowed"};
        }
        hostOut.NetworkMode = host.value.NetworkMode;
    }
    if (host.value.Binds !== undefined) {
        const binds = stringList(host.value.Binds, "Binds");
        if (!binds.ok) {
            return binds;
        }
        hostOut.Binds = binds.value;
    }
    if (host.value.RestartPolicy !== undefined) {
        const policy = takeKeys(host.value.RestartPolicy, RESTART_KEYS, "RestartPolicy");
        if (!policy.ok) {
            return policy;
        }
        if (policy.value.Name !== undefined && !RESTART_NAMES.has(policy.value.Name)) {
            return {ok: false, reason: "restart policy is not allowed"};
        }
        if (policy.value.MaximumRetryCount !== undefined && !Number.isInteger(policy.value.MaximumRetryCount)) {
            return {ok: false, reason: "restart policy is not allowed"};
        }
        hostOut.RestartPolicy = policy.value;
    }
    if (host.value.ShmSize !== undefined) {
        if (!Number.isInteger(host.value.ShmSize) || host.value.ShmSize < 0 || host.value.ShmSize > MAX_SHM) {
            return {ok: false, reason: "shm size is not allowed"};
        }
        hostOut.ShmSize = host.value.ShmSize;
    }
    if (host.value.ReadonlyRootfs !== undefined) {
        if (typeof host.value.ReadonlyRootfs !== "boolean") {
            return {ok: false, reason: "invalid ReadonlyRootfs"};
        }
        hostOut.ReadonlyRootfs = host.value.ReadonlyRootfs;
    }
    if (host.value.Init !== undefined && host.value.Init !== null) {
        if (typeof host.value.Init !== "boolean") {
            return {ok: false, reason: "invalid Init"};
        }
        hostOut.Init = host.value.Init;
    }
    out.HostConfig = hostOut;
    return {ok: true, value: out};
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
            // Report a missing container as 404 so callers can treat stop/remove as a no-op.
            return {allow: false, reason: "unknown container", status: 404};
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
    const normalized = normalizeCreateBody(body, env);
    if (!normalized.ok) {
        return deny(normalized.reason);
    }
    const value = normalized.value;
    if (!imageAllowed(value.Image, env)) {
        return deny("image is not on the plugin allowlist");
    }
    const pluginId = value.Labels?.[PLUGIN_LABEL];
    if (typeof pluginId !== "string" || !PLUGIN_ID.test(pluginId)) {
        return deny("missing growcast.plugin label");
    }
    const expectedName = `plugin-${pluginId.replace(/\./g, "-")}`;
    if (name !== expectedName) {
        return deny("container name does not match plugin id");
    }
    const host = value.HostConfig ?? {};
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
    return allow("create", {upstreamBody: value});
}

export function tokenMatches(presented, expected) {
    const left = Buffer.from(String(presented));
    const right = Buffer.from(String(expected));
    if (left.length !== right.length) {
        timingSafeEqual(right, right);
        return false;
    }
    return timingSafeEqual(left, right);
}

export function proxyAuthConfig(env = process.env) {
    const token = (env.GROWCAST_DOCKER_PROXY_TOKEN ?? "").trim();
    if (!token) {
        return {ok: false, status: 503, reason: "GROWCAST_DOCKER_PROXY_TOKEN is not set"};
    }
    return {ok: true, token};
}

export function authorizeProxyRequest(headers = {}, env = process.env) {
    const config = proxyAuthConfig(env);
    if (!config.ok) {
        return {ok: false, status: config.status, reason: config.reason};
    }
    const raw = headers.authorization ?? headers.Authorization ?? "";
    const header = Array.isArray(raw) ? String(raw[0] ?? "") : String(raw);
    const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
    if (!match || !tokenMatches(match[1], config.token)) {
        return {ok: false, status: 401, reason: "unauthorized"};
    }
    return {ok: true};
}

function isPrivateIPv4(host) {
    const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    if (!match) {
        return false;
    }
    const parts = match.slice(1).map((item) => Number(item));
    if (parts.some((item) => item > 255)) {
        return false;
    }
    const [a, b] = parts;
    if (a === 10 || a === 127) {
        return true;
    }
    if (a === 192 && b === 168) {
        return true;
    }
    if (a === 172 && b >= 16 && b <= 31) {
        return true;
    }
    return a === 169 && b === 254;
}

export function resolveProxyBind(env = process.env) {
    const raw = (env.GROWCAST_DOCKER_PROXY_BIND ?? "").trim() || "127.0.0.1";
    if (raw === "localhost" || raw === "127.0.0.1") {
        return "127.0.0.1";
    }
    if (raw === "::1") {
        return "::1";
    }
    if (raw === "0.0.0.0" || raw === "::") {
        if (env.GROWCAST_DOCKER_PROXY_INTERNAL === "1") {
            return raw;
        }
        throw new Error("refusing to bind the docker proxy on all interfaces without GROWCAST_DOCKER_PROXY_INTERNAL=1");
    }
    if (isPrivateIPv4(raw)) {
        return raw;
    }
    const lower = raw.toLowerCase();
    if (lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80:")) {
        return raw;
    }
    throw new Error(`refusing to bind the docker proxy on ${raw}`);
}

export function planPrivilegeDrop({euid, socketGid, socketExists}) {
    if (!socketExists) {
        return {ok: false, reason: "docker socket is missing"};
    }
    if (!Number.isInteger(socketGid) || socketGid < 0) {
        return {ok: false, reason: "docker socket group is unknown"};
    }
    if (socketGid === 0) {
        return {
            ok: false,
            reason: "docker socket group is root; refusing to chmod the socket or run as root",
        };
    }
    if (euid === 0) {
        return {ok: true, drop: {uid: 1001, gid: 1001, groups: [socketGid]}};
    }
    return {ok: true, drop: null};
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
