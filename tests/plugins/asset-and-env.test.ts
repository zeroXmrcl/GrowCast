import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {pluginAssetCacheControl, pluginAssetVersion} from "../../lib/plugins/import-map.ts";
import {pluginProcessEnv} from "../../lib/plugins/runtime.ts";
import {discoverPlugins} from "../../lib/plugins/discovery.ts";
import {SAMPLE_MANIFEST, withPluginHarness} from "./helpers.ts";

const HASH = `sha256:${"ab".repeat(32)}`;

describe("plugin asset cache versions", () => {
    it("marks only content-hash URLs immutable", () => {
        assert.equal(pluginAssetVersion(HASH, "0.1.0"), HASH);
        assert.equal(pluginAssetVersion("0.1.0", "0.1.0"), "0.1.0");
        assert.match(pluginAssetCacheControl(HASH), /immutable/);
        assert.equal(pluginAssetCacheControl("0.1.0").includes("immutable"), false);
        assert.equal(pluginAssetCacheControl(`sha256:${"AB".repeat(32)}`).includes("immutable"), false);
    });
});

describe("plugin process environment", () => {
    it("passes an allowlist and drops host secrets", () => {
        const env = pluginProcessEnv({
            inherited: {
                PATH: "/usr/bin",
                HOME: "/tmp/plugin-home",
                ADMIN_SESSION_SECRET: "session",
                XAI_API_KEY: "xai",
                GROWCAST_DOCKER_PROXY_TOKEN: "proxy",
                NODE_OPTIONS: "--require /tmp/hook.js",
            },
            pluginId: "community.example",
            token: "plugin-token",
            extra: {XAI_API_KEY: "still-secret", SOLAR_HOST: "example.local"},
            runtimeEnv: {GROWCAST_MESH_TOKEN: "mesh", CUSTOM_FLAG: "1"},
        });
        assert.equal(env.PATH, "/usr/bin");
        assert.equal(env.GROWCAST_PLUGIN_ID, "community.example");
        assert.equal(env.GROWCAST_PLUGIN_TOKEN, "plugin-token");
        assert.equal(env.SOLAR_HOST, "example.local");
        assert.equal(env.CUSTOM_FLAG, "1");
        assert.equal("ADMIN_SESSION_SECRET" in env, false);
        assert.equal("XAI_API_KEY" in env, false);
        assert.equal("GROWCAST_DOCKER_PROXY_TOKEN" in env, false);
        assert.equal("GROWCAST_MESH_TOKEN" in env, false);
        assert.equal("NODE_OPTIONS" in env, false);
        assert.equal(env.NODE_ENV, "production");
    });
});

describe("plugin url slugs", {concurrency: 1}, () => {
    it("rejects every plugin that shares a public slug", async () => {
        await withPluginHarness(async ({writePlugin}) => {
            await writePlugin("one", {...SAMPLE_MANIFEST, id: "community.alpha", name: "One"});
            await writePlugin("two", {...SAMPLE_MANIFEST, id: "other.alpha", name: "Two"});
            const found = await discoverPlugins();
            assert.equal(found.plugins.length, 0);
            assert.equal(found.issues.length, 2);
            assert.match(found.issues[0]?.error ?? "", /duplicate url slug "alpha"/);
        });
    });
});
