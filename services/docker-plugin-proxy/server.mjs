import http from "node:http";
import {Buffer} from "node:buffer";
import {authorizeDockerRequest, stripEngineVersion} from "./policy.mjs";

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

function pipeEngine(clientReq, clientRes, method, pathWithQuery, body) {
    const req = http.request({
        socketPath: SOCKET,
        path: pathWithQuery,
        method,
        headers: {
            ...clientReq.headers,
            host: "localhost",
            connection: "close",
            "content-length": body ? Buffer.byteLength(body) : 0,
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
    if (body) {
        req.write(body);
    }
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

const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url || "/", "http://docker-plugin-proxy");
        const method = req.method || "GET";
        let bodyBuf = Buffer.alloc(0);
        if (method !== "GET" && method !== "HEAD") {
            bodyBuf = await readBody(req);
        }
        let parsedBody;
        if (bodyBuf.length > 0) {
            const text = bodyBuf.toString("utf8");
            try {
                parsedBody = JSON.parse(text);
            } catch {
                json(res, 400, {message: "invalid json"});
                return;
            }
        }
        const decision = await authorizeDockerRequest(
            {
                method,
                pathname: url.pathname,
                search: url.search,
                body: parsedBody,
            },
            {inspect: inspectContainer, env: process.env},
        );
        if (!decision.allow) {
            json(res, 403, {message: decision.reason ?? "forbidden"});
            return;
        }
        let pathWithQuery = url.pathname + url.search;
        if (decision.forceLabelFilter) {
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
            pipeEngine(req, res, method, pathWithQuery, bodyBuf);
            return;
        }
        const result = await engineRequest(method, pathWithQuery, {
            headers: {
                "Content-Type": req.headers["content-type"] || "application/json",
            },
            body: bodyBuf.length > 0 ? bodyBuf : undefined,
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

server.listen(PORT, "0.0.0.0", () => {
    process.stdout.write(`growcast docker-plugin-proxy listening on ${PORT}\n`);
});
