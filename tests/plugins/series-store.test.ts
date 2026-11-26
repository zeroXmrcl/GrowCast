import assert from "node:assert/strict";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import {describe, it} from "node:test";
import {appendPluginSeries, readPluginSeries} from "../../lib/plugins/store.ts";
import {
    listEmptyMetricSeriesFiles,
    removeEmptyMetricSeriesFiles,
    seriesFileIsEmptyMetrics,
} from "../../lib/plugins/series.ts";
import {pluginSeriesDir} from "../../lib/plugins/paths.ts";
import {withPluginHarness} from "./helpers.ts";

const pluginId = "community.example";

describe("plugin series storage", {concurrency: 1}, () => {
    it("skips a manifest that declares no metrics", async () => {
        await withPluginHarness(async () => {
            const result = await appendPluginSeries(pluginId, "2026-11-26T12:00:00.000Z", {"pv.power": 10}, {
                declaredMetrics: false,
                minIntervalMs: 0,
            });
            assert.equal(result, "skipped-no-metrics");
            const series = await readPluginSeries(pluginId, ["pv.power"], ["2026-11-26"]);
            assert.equal(series["pv.power"].length, 0);
        });
    });

    it("skips a point with no metric values", async () => {
        await withPluginHarness(async () => {
            const result = await appendPluginSeries(pluginId, "2026-11-26T12:00:00.000Z", {"pv.power": null}, {
                declaredMetrics: true,
                minIntervalMs: 0,
            });
            assert.equal(result, "skipped-empty");
        });
    });

    it("appends jsonl and throttles a second point inside the interval", async () => {
        await withPluginHarness(async () => {
            const first = await appendPluginSeries(pluginId, "2026-11-26T12:00:00.000Z", {"pv.power": 10}, {
                declaredMetrics: true,
                minIntervalMs: 60_000,
            });
            const second = await appendPluginSeries(pluginId, "2026-11-26T12:00:30.000Z", {"pv.power": 11}, {
                declaredMetrics: true,
                minIntervalMs: 60_000,
            });
            assert.equal(first, "written");
            assert.equal(second, "skipped-throttle");
            const text = await readFile(path.join(pluginSeriesDir(pluginId), "2026-11-26.jsonl"), "utf8");
            assert.equal(text.trim().split("\n").length, 1);
            const series = await readPluginSeries(pluginId, ["pv.power"], ["2026-11-26"]);
            assert.equal(series["pv.power"].length, 1);
            assert.equal(series["pv.power"][0].value, 10);
        });
    });

    it("writes another point after the interval and still reads a legacy day file", async () => {
        await withPluginHarness(async () => {
            const dir = pluginSeriesDir(pluginId);
            await mkdir(dir, {recursive: true});
            await writeFile(path.join(dir, "2026-11-25.json"), `${JSON.stringify({
                date: "2026-11-25",
                points: [{t: "2026-11-25T12:00:00.000Z", metrics: {"pv.power": 4}}],
            })}\n`);
            const written = await appendPluginSeries(pluginId, "2026-11-26T12:02:00.000Z", {"pv.power": 12}, {
                declaredMetrics: true,
                minIntervalMs: 60_000,
            });
            assert.equal(written, "written");
            const series = await readPluginSeries(pluginId, ["pv.power"], ["2026-11-25", "2026-11-26"]);
            assert.deepEqual(series["pv.power"].map((point) => point.value), [4, 12]);
        });
    });

    it("prunes day files older than the retention window and leaves recent empty files", async () => {
        await withPluginHarness(async ({dataDir}) => {
            const dir = pluginSeriesDir(pluginId);
            await mkdir(dir, {recursive: true});
            const oldFile = path.join(dir, "2026-01-01.json");
            const junk = path.join(dir, "2026-11-26.json");
            await writeFile(oldFile, `${JSON.stringify({
                date: "2026-01-01",
                points: [{t: "2026-01-01T00:00:00.000Z", metrics: {"pv.power": 1}}],
            })}\n`);
            await writeFile(junk, `${JSON.stringify({
                date: "2026-11-26",
                points: [{t: "2026-11-26T00:00:00.000Z", metrics: {}}],
            })}\n`);
            await appendPluginSeries(pluginId, "2026-11-26T12:00:00.000Z", {"pv.power": 9}, {
                declaredMetrics: true,
                minIntervalMs: 0,
                retentionDays: 180,
            });
            await assert.rejects(readFile(oldFile, "utf8"));
            const junkText = await readFile(junk, "utf8");
            assert.match(junkText, /2026-11-26/);
            const listed = await listEmptyMetricSeriesFiles(dataDir);
            assert.equal(listed.length, 1);
            assert.equal(listed[0], junk);
            const dry = await listEmptyMetricSeriesFiles(dataDir);
            assert.equal(dry.length, 1);
            assert.equal(seriesFileIsEmptyMetrics(junkText, "json"), true);
        });
    });

    it("deletes empty-metric series files only when apply is requested", async () => {
        await withPluginHarness(async ({dataDir}) => {
            const dir = pluginSeriesDir(pluginId);
            await mkdir(dir, {recursive: true});
            const junk = path.join(dir, "2026-11-26.jsonl");
            await writeFile(junk, `${JSON.stringify({t: "2026-11-26T00:00:06.000Z", metrics: {}})}\n`);
            const listed = await listEmptyMetricSeriesFiles(dataDir);
            assert.deepEqual(listed, [junk]);
            const still = await readFile(junk, "utf8");
            assert.match(still, /metrics/);
            await removeEmptyMetricSeriesFiles(listed);
            await assert.rejects(readFile(junk, "utf8"));
        });
    });
});
