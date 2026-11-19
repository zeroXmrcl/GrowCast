import assert from "node:assert/strict";
import {mkdir, writeFile} from "node:fs/promises";
import path from "node:path";
import {describe, it} from "node:test";
import {enablePlugin, getRegistryRecord, listRegistryRecords} from "../../lib/plugins/registry.ts";
import {scanAndPauseChangedPlugins} from "../../lib/plugins/lifecycle.ts";
import {hashPluginFolder, pluginFolderSignature} from "../../lib/plugins/hash.ts";
import {SAMPLE_MANIFEST, withPluginHarness} from "./helpers.ts";

describe("plugin hash pin", {concurrency: 1}, () => {
    it("pins SHA-256 at enable time", async () => {
        await withPluginHarness(async ({writePlugin}) => {
            const dir = await writePlugin("example", SAMPLE_MANIFEST);
            const hash = await hashPluginFolder(dir);
            const record = await enablePlugin("community.example");
            assert.equal(record.status, "enabled");
            assert.equal(record.pinnedHash, hash);
            assert.equal(record.hashMatches, true);
            assert.match(hash, /^sha256:[0-9a-f]{64}$/);
        });
    });

    it("auto-pauses when plugin files change after enable", async () => {
        await withPluginHarness(async ({writePlugin}) => {
            const dir = await writePlugin("example", SAMPLE_MANIFEST);
            await enablePlugin("community.example");
            await writeFile(path.join(dir, "ui/dist/index.js"), "export default { tampered: true }\n");
            const paused = await scanAndPauseChangedPlugins();
            assert.deepEqual(paused, ["community.example"]);
            const record = await getRegistryRecord("community.example");
            assert.equal(record?.status, "paused");
            assert.equal(record?.pausedReason, "hash-mismatch");
            assert.equal(record?.hashMatches, false);
        });
    });

    it("rejects ingest after a hash mismatch until re-confirmed", async () => {
        await withPluginHarness(async ({writePlugin}) => {
            const dir = await writePlugin("example", SAMPLE_MANIFEST);
            await enablePlugin("community.example");
            await writeFile(path.join(dir, "ui/dist/index.js"), "export default { tampered: true }\n");
            const {ingestPluginPayload} = await import("../../lib/plugins/ingest.ts");
            const result = await ingestPluginPayload("community.example", {
                apiVersion: 1,
                observedAt: "2026-11-17T09:59:50.000Z",
                metrics: {"battery.soc": {value: 10}},
            });
            assert.equal(result.ok, false);
            if (!result.ok) {
                assert.equal(result.status, 409);
            }
        });
    });

    it("includes host/dist in the pin and pauses when that bundle changes", async () => {
        await withPluginHarness(async ({writePlugin}) => {
            const dir = await writePlugin("example", SAMPLE_MANIFEST);
            const before = await hashPluginFolder(dir);
            const beforeSig = await pluginFolderSignature(dir);
            await enablePlugin("community.example");
            await mkdir(path.join(dir, "host", "dist"), {recursive: true});
            await writeFile(path.join(dir, "host", "dist", "index.js"), "export const host = 1\n");
            const after = await hashPluginFolder(dir);
            assert.notEqual(after, before);
            const signature = await pluginFolderSignature(dir);
            assert.notEqual(signature, beforeSig);
            assert.match(signature, /host\/dist\/index\.js/);
            assert.match(signature, /plugin\.json\u0000/);
            const paused = await scanAndPauseChangedPlugins();
            assert.deepEqual(paused, ["community.example"]);
            const record = await getRegistryRecord("community.example");
            assert.equal(record?.status, "paused");
            assert.equal(record?.pausedReason, "hash-mismatch");
            assert.equal(record?.hashMatches, false);
            await writeFile(path.join(dir, "ui/dist/index.js"), "export default { ui: true }\n");
            const afterUi = await hashPluginFolder(dir);
            assert.notEqual(afterUi, after);
            await writeFile(path.join(dir, "GROWCAST-HASH"), `${before}\n`);
            assert.equal(await hashPluginFolder(dir), afterUi);
            await writeFile(path.join(dir, "host", "dist", "index.js"), "export const host = 2\n// rebuilt\n");
            assert.notEqual(await hashPluginFolder(dir), afterUi);
        });
    });

    it("does not include snapshots or timelapse media in the pin", async () => {
        await withPluginHarness(async ({writePlugin}) => {
            const dir = await writePlugin("example", SAMPLE_MANIFEST);
            const before = await hashPluginFolder(dir);
            await mkdir(path.join(dir, "snapshots"), {recursive: true});
            await writeFile(path.join(dir, "snapshots", "frame.jpg"), "jpeg");
            await mkdir(path.join(dir, "timelapse"), {recursive: true});
            await writeFile(path.join(dir, "timelapse", "out.mp4"), "mp4");
            const after = await hashPluginFolder(dir);
            assert.equal(after, before);
        });
    });

    it("does not pause unchanged enabled plugins", async () => {
        await withPluginHarness(async ({writePlugin}) => {
            await writePlugin("example", SAMPLE_MANIFEST);
            await enablePlugin("community.example");
            const paused = await scanAndPauseChangedPlugins();
            assert.deepEqual(paused, []);
            const records = await listRegistryRecords();
            assert.equal(records[0]?.status, "enabled");
        });
    });
});
