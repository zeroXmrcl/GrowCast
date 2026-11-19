import assert from "node:assert/strict";
import {cp, mkdir, readFile} from "node:fs/promises";
import path from "node:path";
import {describe, it} from "node:test";
import {findDiscoveredPlugin} from "../../lib/plugins/discovery.ts";
import {loadHostModule} from "../../lib/plugins/first-party.ts";
import {ingestPluginPayload} from "../../lib/plugins/ingest.ts";
import {enablePlugin} from "../../lib/plugins/registry.ts";
import {readPluginState} from "../../lib/plugins/store.ts";
import {withPluginHarness} from "./helpers.ts";

const SOLAR_ROOT = process.env.GROWCAST_SOLAR_PLUGIN
    ?? "/tmp/plugin-fix/GrowCast-Solar";

function body(observedAt: string, mode: number) {
    const metrics: Record<string, number> = {
        "pv.power": 4200,
        "battery.power": mode === 1 ? -200 : 800,
        "grid.power": mode === 1 ? -100 : 0,
        "house.power": 1800,
        "tent.power": 600,
        "grid.mode": mode,
        "battery.soc": 55,
        "battery.capacity": 14000,
        "system.state": 0,
    };
    return {
        apiVersion: 1,
        observedAt,
        metrics: Object.fromEntries(Object.entries(metrics).map(([key, value]) => [key, {value}])),
    };
}

describe("solar ingest through the host", {concurrency: 1}, () => {
    it("persists grid mode, history, and the restored notice from the built plugin", async () => {
        const manifest = JSON.parse(await readFile(path.join(SOLAR_ROOT, "plugin.json"), "utf8")) as {id: string};
        const built = path.join(SOLAR_ROOT, "host", "dist", "index.js");
        await withPluginHarness(async ({writePlugin}) => {
            const folder = await writePlugin("solar", manifest);
            await mkdir(path.join(folder, "host", "dist"), {recursive: true});
            await cp(built, path.join(folder, "host", "dist", "index.js"));
            await enablePlugin("growcast.solar");
            const start = Date.now() - 40_000;
            const steps = [
                {mode: 1, at: start},
                {mode: 2, at: start + 15_000},
                {mode: 1, at: start + 30_000},
            ];
            let restoredAt = "";
            for (const step of steps) {
                const observedAt = new Date(step.at).toISOString();
                if (step.mode === 1 && step !== steps[0]) {
                    restoredAt = observedAt;
                }
                const result = await ingestPluginPayload("growcast.solar", body(observedAt, step.mode), step.at);
                assert.equal(result.ok, true, JSON.stringify(result));
            }
            const stored = await readPluginState("growcast.solar");
            assert.ok(stored?.state);
            assert.equal(stored.state.lastGridMode, 1);
            assert.equal(stored.state.restoredAt, restoredAt);
            assert.ok(stored.state.history && typeof stored.state.history === "object");
            assert.ok(Array.isArray((stored.state.history as {buckets?: unknown}).buckets));
            const allocation = stored.state.allocation as {tentFromSolarW?: unknown};
            assert.equal(typeof allocation?.tentFromSolarW, "number");

            const discovered = await findDiscoveredPlugin("growcast.solar");
            assert.ok(discovered);
            const host = await loadHostModule(discovered);
            assert.ok(host?.handlePublic);
            const response = await host.handlePublic(
                new Request("http://127.0.0.1/api/data/plugins/growcast.solar/range?window=live"),
                "range",
            );
            assert.equal(response.status, 200);
            const view = await response.json() as {
                sample?: boolean;
                board: {notice: {kind: string; title: string; body: string} | null};
            };
            assert.notEqual(view.sample, true);
            assert.equal(view.board.notice?.kind, "restored");
            assert.equal(view.board.notice?.title, "Power restored");
            assert.equal(view.board.notice?.body, "");

            // The deployed host persists the object it passed in. The plugin has to
            // fill that object; replacing input.state leaves the stored state empty.
            const held: Record<string, unknown> = {};
            await host.onIngest?.({
                pluginId: "growcast.solar",
                observedAt: new Date(start + 45_000).toISOString(),
                metrics: {"grid.mode": 1, "battery.soc": 55, "tent.power": 600},
                state: held,
            });
            assert.equal(held.lastGridMode, 1);
            assert.equal(typeof held.restoredAt, "string");
            assert.ok(held.history && typeof held.history === "object");
            assert.ok(held.allocation && typeof held.allocation === "object");
        });
    });
});
