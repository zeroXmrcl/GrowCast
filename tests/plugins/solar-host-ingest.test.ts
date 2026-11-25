import assert from "node:assert/strict";
import {cp, mkdir} from "node:fs/promises";
import path from "node:path";
import {describe, it} from "node:test";
import {findDiscoveredPlugin} from "../../lib/plugins/discovery.ts";
import {loadHostModule} from "../../lib/plugins/first-party.ts";
import {ingestPluginPayload} from "../../lib/plugins/ingest.ts";
import {enablePlugin} from "../../lib/plugins/registry.ts";
import {readPluginState} from "../../lib/plugins/store.ts";
import {withPluginHarness} from "./helpers.ts";

const SOLAR_ROOT = process.env.GROWCAST_SOLAR_PLUGIN
    ?? path.join(process.cwd(), "plugins", "solar");

function body(observedAt: string) {
    const metrics: Record<string, number> = {
        "pv.power": 4200,
        "battery.power": 800,
        "grid.power": 0,
        "house.power": 1800,
        "tent.power": 600,
        "grid.mode": 1,
        "battery.soc": 55,
    };
    return {
        apiVersion: 1,
        observedAt,
        metrics: Object.fromEntries(Object.entries(metrics).map(([key, value]) => [key, {value}])),
    };
}

describe("solar ingest through the host", {concurrency: 1}, () => {
    it("persists the allocation and serves a live view from the plugin sources", async () => {
        const manifest = JSON.parse(await (await import("node:fs/promises")).readFile(path.join(SOLAR_ROOT, "plugin.json"), "utf8")) as {id: string};
        await withPluginHarness(async ({writePlugin}) => {
            const folder = await writePlugin("solar", manifest);
            await mkdir(path.join(folder, "host"), {recursive: true});
            await cp(path.join(SOLAR_ROOT, "host"), path.join(folder, "host"), {recursive: true});
            await enablePlugin("growcast.solar");
            const observedAt = new Date().toISOString();
            const result = await ingestPluginPayload("growcast.solar", body(observedAt), Date.now());
            assert.equal(result.ok, true, JSON.stringify(result));
            const stored = await readPluginState("growcast.solar");
            const allocation = stored?.state?.allocation as {tentFromSolarW?: unknown} | undefined;
            assert.equal(typeof allocation?.tentFromSolarW, "number");

            const discovered = await findDiscoveredPlugin("growcast.solar");
            assert.ok(discovered);
            const host = await loadHostModule(discovered, "solar-test");
            assert.ok(host?.handlePublic);
            const response = await host.handlePublic(
                new Request("http://127.0.0.1/api/data/plugins/growcast.solar/range?window=live"),
                "range",
            );
            assert.equal(response.status, 200);
            const view = await response.json() as {sample?: boolean};
            assert.notEqual(view.sample, true);
        });
    });
});
