import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    authorizeCreate,
    authorizeDockerRequest,
    bindAllowed,
    imageAllowed,
    networkModeAllowed,
} from "../../services/docker-plugin-proxy/policy.mjs";

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
