import http from "node:http";
import fs from "node:fs";
import {Buffer} from "node:buffer";
import {pathToFileURL} from "node:url";
import {
    authorizeDockerRequest,
    authorizeProxyRequest,
    parseStrictJson,
    planPrivilegeDrop,
    proxyAuthConfig,
    resolveProxyBind,
    stripEngineVersion,
} from "./policy.mjs";

const SOCKET = process.env.DOCKER_SOCKET || "/var/run/docker.sock";
const PORT = Number(process.env.GROWCAST_DOCKER_PROXY_PORT || 2375);
const MAX_BODY = 1_000_000;

function json(res, status, body) {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
    });
    res.end(payload);
}

function engineRequest(method, pathWithQuery, {headers = {}, body} = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            socketPath: SOCKET,
            path: pathWithQuery,
            method,
            headers: {
                ...headers,
                Host: "localhost",
                Connection: "close",
            },
        }, (res) => {
            const chunks = [];
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("end", () => {
                resolve({
                    status: res.statusCode ?? 502,
                    headers: res.headers,
                    body: Buffer.concat(chunks),
                });
            });
        });
        req.on("error", reject);
        if (body) {
            req.write(body);
        }
        req.end();
    });
}

function pipeEngine(clientRes, method, pathWithQuery) {
    const req = http.request({
        socketPath: SOCKET,
        path: pathWithQuery,
        method,
        headers: {
            host: "localhost",
            connection: "close",
        },
    }, (res) => {
        clientRes.writeHead(res.statusCode ?? 502, res.headers);
        res.pipe(clientRes);
    });
    req.on("error", () => {
        if (!clientRes.headersSent) {
            json(clientRes, 502, {message: "engine unreachable"});
        } else {
            clientRes.end();
        }
    });
    req.end();
}

async function inspectContainer(id) {
    const result = await engineRequest("GET", `/containers/${encodeURIComponent(id)}/json`);
    if (result.status === 404) {
        const error = new Error("not found");
        error.status = 404;
        throw error;
    }
    if (result.status >= 400) {
        throw new Error(`inspect ${result.status}`);
    }
    return JSON.parse(result.body.toString("utf8") || "{}");
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on("data", (chunk) => {
            size += chunk.length;
            if (size > MAX_BODY) {
                reject(Object.assign(new Error("payload too large"), {status: 413}));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on("end", () => resolve(Buffer.concat(chunks)));
        req.on("error", reject);
    });
}

export async function evaluateProxyRequest({method, url, headers, body, env, inspect}) {
    const auth = authorizeProxyRequest(headers ?? {}, env);
    if (!auth.ok) {
        return {allow: false, status: auth.status, message: auth.reason};
    }
    const raw = Buffer.isBuffer(body) ? body : Buffer.from(body ? String(body) : "");
    let parsed;
    if (raw.length > 0) {
        const decoded = parseStrictJson(raw.toString("utf8"));
        if (!decoded.ok) {
            return {allow: false, status: 400, message: decoded.reason};
        }
        parsed = decoded.value;
    }
    const target = new URL(url || "/", "http://docker-plugin-proxy");
    const decision = await authorizeDockerRequest(
        {
            method: method || "GET",
            pathname: target.pathname,
            search: target.search,
            body: parsed,
        },
        {inspect, env},
    );
    if (!decision.allow) {
        return {allow: false, status: 403, message: decision.reason ?? "forbidden"};
    }
    const upstreamBody = decision.upstreamBody !== undefined
        ? Buffer.from(JSON.stringify(decision.upstreamBody))
        : (raw.length > 0 ? raw : undefined);
    return {allow: true, decision, upstreamBody, url: target};
}

const server = http.createServer(async (req, res) => {
    try {
        const early = authorizeProxyRequest(req.headers, process.env);
        if (!early.ok) {
            json(res, early.status, {message: early.reason});
            return;
        }
        const url = new URL(req.url || "/", "http://docker-plugin-proxy");
        const method = req.method || "GET";
        let bodyBuf = Buffer.alloc(0);
        if (method !== "GET" && method !== "HEAD") {
            bodyBuf = await readBody(req);
        }
        const evaluated = await evaluateProxyRequest({
            method,
            url: `${url.pathname}${url.search}`,
            headers: req.headers,
            body: bodyBuf,
            env: process.env,
            inspect: inspectContainer,
        });
        if (!evaluated.allow) {
            json(res, evaluated.status, {message: evaluated.message ?? "forbidden"});
            return;
        }
        let pathWithQuery = url.pathname + url.search;
        if (evaluated.decision.forceLabelFilter) {
            const params = new URLSearchParams(url.search.startsWith("?") ? url.search.slice(1) : url.search);
            let filters = {};
            try {
                filters = JSON.parse(params.get("filters") || "{}");
            } catch {
                filters = {};
            }
            const labels = Array.isArray(filters.label)
                ? filters.label.map(String)
                : filters.label
                    ? [String(filters.label)]
                    : [];
            if (!labels.some((label) => label === "growcast.plugin" || label.startsWith("growcast.plugin="))) {
                labels.push("growcast.plugin");
            }
            filters.label = labels;
            params.set("filters", JSON.stringify(filters));
            pathWithQuery = `${url.pathname}?${params.toString()}`;
        }
        const stripped = stripEngineVersion(url.pathname);
        const streaming = method === "GET" && /\/containers\/[^/]+\/logs$/.test(stripped);
        if (streaming) {
            pipeEngine(res, method, pathWithQuery);
            return;
        }
        const result = await engineRequest(method, pathWithQuery, {
            headers: {
                "Content-Type": "application/json",
            },
            body: evaluated.upstreamBody,
        });
        const headers = {...result.headers};
        delete headers.connection;
        res.writeHead(result.status, headers);
        res.end(result.body);
    } catch (error) {
        const status = error && error.status === 413 ? 413 : 500;
        if (!res.headersSent) {
            json(res, status, {message: error instanceof Error ? error.message : "proxy error"});
        }
    }
});

function dropPrivileges() {
    let socketExists = false;
    let socketGid = -1;
    try {
        const info = fs.statSync(SOCKET);
        socketExists = info.isSocket();
        socketGid = info.gid;
    } catch {
        socketExists = false;
    }
    const euid = typeof process.geteuid === "function" ? process.geteuid() : 0;
    const plan = planPrivilegeDrop({euid, socketGid, socketExists});
    if (!plan.ok) {
        process.stderr.write(`${plan.reason}\n`);
        process.exit(1);
    }
    if (plan.drop) {
        process.setgroups(plan.drop.groups);
        process.setgid(plan.drop.gid);
        process.setuid(plan.drop.uid);
    }
    try {
        fs.accessSync(SOCKET, fs.constants.R_OK | fs.constants.W_OK);
    } catch {
        process.stderr.write("cannot open docker socket; refusing to chmod it\n");
        process.exit(1);
    }
}

export function startProxy() {
    const auth = proxyAuthConfig(process.env);
    if (!auth.ok) {
        process.stderr.write(`${auth.reason}\n`);
        process.exit(1);
    }
    let bind;
    try {
        bind = resolveProxyBind(process.env);
    } catch (error) {
        process.stderr.write(`${error instanceof Error ? error.message : "refusing bind"}\n`);
        process.exit(1);
    }
    dropPrivileges();
    server.listen(PORT, bind, () => {
        process.stdout.write(`growcast docker-plugin-proxy listening on ${bind}:${PORT}\n`);
    });
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
    startProxy();
}
