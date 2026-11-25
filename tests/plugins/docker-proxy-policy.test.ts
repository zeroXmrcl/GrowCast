import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {readFileSync} from "node:fs";
import path from "node:path";
import {
    authorizeCreate,
    authorizeDockerRequest,
    authorizeProxyRequest,
    bindAllowed,
    imageAllowed,
    networkModeAllowed,
    parseStrictJson,
    planPrivilegeDrop,
    resolveProxyBind,
} from "../../services/docker-plugin-proxy/policy.mjs";
import {evaluateProxyRequest} from "../../services/docker-plugin-proxy/server.mjs";

const env = {
    GROWCAST_HOST_PROJECT: "<install-dir>",
    GROWCAST_PLUGIN_NETWORK: "growcast_default",
    GROWCAST_PLUGIN_IMAGES: "growcast-plugin-ggs:local",
};

const pluginInspect = {
    Name: "/plugin-growcast-ggs",
    Config: {Labels: {"growcast.plugin": "growcast.ggs"}},
};

describe("docker plugin proxy policy", () => {
    it("allows labeled list/inspect/start/stop/restart/logs", async () => {
        const inspect = async () => pluginInspect;
        for (const [method, pathname] of [
            ["GET", "/containers/json"],
            ["GET", "/v1.43/containers/plugin-growcast-ggs/json"],
            ["POST", "/containers/plugin-growcast-ggs/start"],
            ["POST", "/containers/plugin-growcast-ggs/stop"],
            ["POST", "/containers/plugin-growcast-ggs/restart"],
            ["GET", "/containers/plugin-growcast-ggs/logs"],
        ] as const) {
            const decision = await authorizeDockerRequest({method, pathname}, {inspect, env});
            assert.equal(decision.allow, true, `${method} ${pathname}`);
        }
    });

    it("denies unlabeled containers and host-level APIs", async () => {
        const inspect = async () => ({Name: "/growcast", Config: {Labels: {}}});
        const unlabeled = await authorizeDockerRequest(
            {method: "POST", pathname: "/containers/growcast/start"},
            {inspect, env},
        );
        assert.equal(unlabeled.allow, false);
        for (const pathname of [
            "/images/json",
            "/networks",
            "/volumes",
            "/build",
            "/exec",
            "/containers/growcast/exec",
            "/containers/plugin-growcast-ggs/attach",
            "/containers/plugin-growcast-ggs/wait",
            "/containers/plugin-growcast-ggs/kill",
        ]) {
            const decision = await authorizeDockerRequest(
                {method: pathname === "/build" ? "POST" : "GET", pathname},
                {inspect: async () => pluginInspect, env},
            );
            assert.equal(decision.allow, false, pathname);
        }
    });

    it("allows create only for allowlisted images with the plugin label and safe binds", () => {
        const body = {
            Image: "growcast-plugin-ggs:local",
            Labels: {"growcast.plugin": "growcast.ggs"},
            HostConfig: {
                Privileged: false,
                CapAdd: [],
                Devices: [],
                NetworkMode: "growcast_default",
                Binds: [
                    "<install-dir>/plugins/ggs:/plugin:ro",
                    "<install-dir>/data/plugins/growcast.ggs:/data",
                ],
            },
        };
        const ok = authorizeCreate("plugin-growcast-ggs", body, env);
        assert.equal(ok.allow, true);
    });

    it("denies privileged, host net, extra caps, devices, and off-tree binds", () => {
        const base = {
            Image: "growcast-plugin-ggs:local",
            Labels: {"growcast.plugin": "growcast.ggs"},
            HostConfig: {
                Binds: ["<install-dir>/plugins/ggs:/plugin:ro", "<install-dir>/data/plugins/growcast.ggs:/data"],
            },
        };
        assert.equal(authorizeCreate("plugin-growcast-ggs", {
            ...base,
            HostConfig: {...base.HostConfig, Privileged: true},
        }, env).allow, false);
        assert.equal(authorizeCreate("plugin-growcast-ggs", {
            ...base,
            HostConfig: {...base.HostConfig, NetworkMode: "host"},
        }, env).allow, false);
        assert.equal(authorizeCreate("plugin-growcast-ggs", {
            ...base,
            HostConfig: {...base.HostConfig, CapAdd: ["SYS_ADMIN"]},
        }, env).allow, false);
        assert.equal(authorizeCreate("plugin-growcast-ggs", {
            ...base,
            HostConfig: {...base.HostConfig, Devices: [{PathOnHost: "/dev/sda"}]},
        }, env).allow, false);
        assert.equal(authorizeCreate("plugin-growcast-ggs", {
            ...base,
            HostConfig: {
                ...base.HostConfig,
                Binds: ["/var/run/docker.sock:/var/run/docker.sock", ...base.HostConfig.Binds],
            },
        }, env).allow, false);
        assert.equal(authorizeCreate("growcast", base, env).allow, false);
        assert.equal(authorizeCreate("plugin-growcast-ggs", {
            ...base,
            Image: "ubuntu:24.04",
        }, env).allow, false);
    });

    it("checks image and bind helpers", () => {
        assert.equal(imageAllowed("growcast-plugin-ggs:local", env), true);
        assert.equal(imageAllowed("ubuntu:24.04", env), false);
        assert.equal(bindAllowed("<install-dir>/plugins/ggs:/plugin:ro", "growcast.ggs", env), true);
        assert.equal(bindAllowed("<install-dir>/plugins/ggs:/plugin", "growcast.ggs", env), false);
        assert.equal(bindAllowed("/etc/passwd:/plugin:ro", "growcast.ggs", env), false);
        assert.equal(networkModeAllowed("host", env), false);
        assert.equal(networkModeAllowed("growcast_default", env), true);
    });
});

const tokenEnv = {...env, GROWCAST_DOCKER_PROXY_TOKEN: "proxy-token-value"};

function safeCreate(hostConfig = {}) {
    return {
        Image: "growcast-plugin-ggs:local",
        Labels: {"growcast.plugin": "growcast.ggs"},
        HostConfig: {
            NetworkMode: "growcast_default",
            Binds: [
                "<install-dir>/plugins/ggs:/plugin:ro",
                "<install-dir>/data/plugins/growcast.ggs:/data",
            ],
            ...hostConfig,
        },
    };
}

describe("docker plugin proxy case-insensitive allowlist", () => {
    it("rejects case-variant privileged, caps, devices, and host namespaces", () => {
        for (const hostConfig of [
            {privileged: true},
            {PRIVILEGED: true},
            {Privileged: false, privileged: true},
            {CapAdd: ["SYS_ADMIN"]},
            {capadd: ["ALL"]},
            {Devices: [{PathOnHost: "/dev/sda"}]},
            {devices: [{PathOnHost: "/dev/net/tun"}]},
            {DeviceRequests: [{Count: -1, Capabilities: [["gpu"]]}]},
            {PidMode: "host"},
            {pidmode: "host"},
            {IpcMode: "host"},
            {ipcmode: "shareable"},
            {NetworkMode: "host"},
            {networkmode: "HOST"},
            {CgroupnsMode: "host"},
            {UsernsMode: "host"},
            {UTSMode: "host"},
            {SecurityOpt: ["seccomp=unconfined"]},
            {securityopt: ["apparmor=unconfined"]},
            {SecurityOpt: ["label=disable"]},
            {SecurityOpt: ["no-new-privileges=false"]},
            {Binds: ["/var/run/docker.sock:/var/run/docker.sock"]},
            {binds: ["/:/host"]},
            {Mounts: [{Type: "bind", Source: "/", Target: "/host"}]},
            {mounts: [{Type: "bind", Source: "/etc", Target: "/etc"}]},
            {VolumesFrom: ["growcast"]},
            {GroupAdd: ["0"]},
            {Sysctls: {"kernel.unprivileged_userns_clone": "1"}},
            {PublishAllPorts: true},
            {PortBindings: {"80/tcp": [{HostPort: "80"}]}},
            {MaskedPaths: []},
            {ReadonlyPaths: []},
            {Runtime: "runc-custom"},
            {CgroupParent: "/"},
        ]) {
            const decision = authorizeCreate("plugin-growcast-ggs", safeCreate(hostConfig), env);
            assert.equal(decision.allow, false, JSON.stringify(hostConfig));
        }
        const nested = authorizeCreate("plugin-growcast-ggs", {
            image: "growcast-plugin-ggs:local",
            labels: {"growcast.plugin": "growcast.ggs"},
            hostconfig: {privileged: true},
        }, env);
        assert.equal(nested.allow, false);
    });

    it("rejects duplicate keys and unicode-escaped privileged before Docker would", () => {
        const duplicate = parseStrictJson(JSON.stringify({
            Image: "growcast-plugin-ggs:local",
            Labels: {"growcast.plugin": "growcast.ggs"},
            HostConfig: {Privileged: false},
        }).replace("\"Privileged\":false", "\"Privileged\":false,\"privileged\":true"));
        assert.equal(duplicate.ok, false);
        assert.match(duplicate.reason, /duplicate key/i);
        const escaped = parseStrictJson("{\"HostConfig\":{\"\\u0070rivileged\":true}}");
        assert.equal(escaped.ok, true);
        const decision = authorizeCreate("plugin-growcast-ggs", {
            ...safeCreate(),
            HostConfig: {...safeCreate().HostConfig, ...escaped.value.HostConfig},
        }, env);
        assert.equal(decision.allow, false);
        const exact = parseStrictJson("{\"Image\":\"a\",\"Image\":\"b\"}");
        assert.equal(exact.ok, false);
    });

    it("forwards only the canonical allowlisted body", () => {
        const decision = authorizeCreate("plugin-growcast-ggs", {
            image: "growcast-plugin-ggs:local",
            labels: {"growcast.plugin": "growcast.ggs"},
            hostconfig: {
                networkmode: "growcast_default",
                binds: [
                    "<install-dir>/plugins/ggs:/plugin:ro",
                    "<install-dir>/data/plugins/growcast.ggs:/data",
                ],
            },
        }, env);
        assert.equal(decision.allow, true);
        assert.equal(decision.upstreamBody.Image, "growcast-plugin-ggs:local");
        assert.equal(decision.upstreamBody.HostConfig.NetworkMode, "growcast_default");
        assert.equal(decision.upstreamBody.hostconfig, undefined);
        assert.equal(decision.upstreamBody.HostConfig.Privileged, undefined);
    });

    it("rejects unknown create keys", () => {
        const decision = authorizeCreate("plugin-growcast-ggs", {
            ...safeCreate(),
            HostConfig: {...safeCreate().HostConfig, NanoCpus: 1},
        }, env);
        assert.equal(decision.allow, false);
        assert.match(decision.reason, /unknown key/i);
    });
});

describe("docker plugin proxy auth and bind", () => {
    it("fails closed when the shared token is unset and rejects a bad token", async () => {
        assert.equal(authorizeProxyRequest({authorization: "Bearer x"}, {}).ok, false);
        assert.equal(authorizeProxyRequest({authorization: "Bearer x"}, {}).status, 503);
        const missing = await evaluateProxyRequest({
            method: "POST",
            url: "/containers/create?name=plugin-growcast-ggs",
            headers: {authorization: "Bearer proxy-token-value"},
            body: JSON.stringify(safeCreate()),
            env,
            inspect: async () => ({}),
        });
        assert.equal(missing.status, 503);
        const wrong = await evaluateProxyRequest({
            method: "POST",
            url: "/containers/create?name=plugin-growcast-ggs",
            headers: {authorization: "Bearer wrong"},
            body: JSON.stringify(safeCreate({privileged: true})),
            env: tokenEnv,
            inspect: async () => ({}),
        });
        assert.equal(wrong.status, 401);
        const bypass = await evaluateProxyRequest({
            method: "POST",
            url: "/containers/create?name=plugin-growcast-ggs",
            headers: {authorization: "Bearer proxy-token-value"},
            body: JSON.stringify(safeCreate({privileged: true})),
            env: tokenEnv,
            inspect: async () => ({}),
        });
        assert.equal(bypass.allow, false);
        assert.equal(bypass.status, 403);
        assert.equal(bypass.upstreamBody, undefined);
    });

    it("returns 404 for a container that does not exist yet", async () => {
        const tokenEnv = {...env, GROWCAST_DOCKER_PROXY_TOKEN: "proxy-token-value"};
        const missingInspect = async () => {
            throw Object.assign(new Error("no such container"), {status: 404});
        };
        for (const [method, url] of [
            ["POST", "/containers/plugin-growcast-ggs/stop"],
            ["DELETE", "/containers/plugin-growcast-ggs?force=1"],
            ["POST", "/containers/plugin-growcast-ggs/start"],
        ] as const) {
            const result = await evaluateProxyRequest({
                method,
                url,
                headers: {authorization: "Bearer proxy-token-value"},
                body: "",
                env: tokenEnv,
                inspect: missingInspect,
            });
            assert.equal(result.allow, false);
            assert.equal(result.status, 404);
        }
        const foreign = await evaluateProxyRequest({
            method: "POST",
            url: "/containers/growcast/stop",
            headers: {authorization: "Bearer proxy-token-value"},
            body: "",
            env: tokenEnv,
            inspect: async () => ({Name: "/growcast", Config: {Labels: {}}}),
        });
        assert.equal(foreign.status, 403);
    });

    it("binds to localhost unless the compose network is explicit", () => {
        assert.equal(resolveProxyBind({}), "127.0.0.1");
        assert.equal(resolveProxyBind({GROWCAST_DOCKER_PROXY_BIND: "localhost"}), "127.0.0.1");
        assert.equal(resolveProxyBind({GROWCAST_DOCKER_PROXY_BIND: "10.1.2.3"}), "10.1.2.3");
        assert.throws(() => resolveProxyBind({GROWCAST_DOCKER_PROXY_BIND: "0.0.0.0"}), /all interfaces/);
        assert.equal(resolveProxyBind({
            GROWCAST_DOCKER_PROXY_BIND: "0.0.0.0",
            GROWCAST_DOCKER_PROXY_INTERNAL: "1",
        }), "0.0.0.0");
        assert.throws(() => resolveProxyBind({GROWCAST_DOCKER_PROXY_BIND: "8.8.8.8"}), /refusing/);
    });

    it("joins the socket group and never chmods the socket", () => {
        assert.equal(planPrivilegeDrop({euid: 0, socketGid: 0, socketExists: true}).ok, false);
        assert.match(planPrivilegeDrop({euid: 0, socketGid: 0, socketExists: true}).reason, /chmod/);
        const dropped = planPrivilegeDrop({euid: 0, socketGid: 999, socketExists: true});
        assert.deepEqual(dropped.drop, {uid: 1001, gid: 1001, groups: [999]});
        assert.equal(planPrivilegeDrop({euid: 0, socketGid: 999, socketExists: false}).ok, false);
        const server = readFileSync(path.join(process.cwd(), "services/docker-plugin-proxy/server.mjs"), "utf8");
        const docker = readFileSync(path.join(process.cwd(), "services/docker-plugin-proxy/Dockerfile"), "utf8");
        assert.match(server, /setgroups/);
        assert.doesNotMatch(server, /0666/);
        assert.doesNotMatch(docker, /0666/);
        assert.doesNotMatch(docker, /chmod/);
    });
});
