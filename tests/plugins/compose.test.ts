import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {enablePlugin} from "../../lib/plugins/registry.ts";
import {generatePluginsCompose} from "../../lib/plugins/compose.ts";
import {SAMPLE_MANIFEST, withPluginHarness} from "./helpers.ts";

describe("generated plugin compose", {concurrency: 1}, () => {
    it("writes an empty services mapping when nothing is enabled", async () => {
        await withPluginHarness(async ({writePlugin}) => {
            await writePlugin("example", {
                ...SAMPLE_MANIFEST,
                runtime: {type: "python", entry: "backend/main.py"},
            });
            const yaml = await generatePluginsCompose();
            assert.match(yaml, /services: \{\}/);
        });
    });

    it("emits a service for an enabled plugin and does not interpolate .env.local", async () => {
        await withPluginHarness(async ({writePlugin}) => {
            await writePlugin("example", {
                ...SAMPLE_MANIFEST,
                runtime: {type: "docker", dockerfile: "Dockerfile"},
            });
            await enablePlugin("community.example");
            const yaml = await generatePluginsCompose();
            assert.match(yaml, /plugin-community-example:/);
            assert.match(yaml, /GROWCAST_URL: "http:\/\/growcast:3000"/);
            assert.match(yaml, /\.\/data\/plugins\/community\.example\/runtime\.env/);
            assert.doesNotMatch(yaml, /\.env\.local/);
            assert.doesNotMatch(yaml, /GROWCAST_RESTREAM_TOKEN:\s*\$\{/);
        });
    });
});
