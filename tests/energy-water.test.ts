import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {describe, it} from "node:test";
import {berlinDateOnly, berlinHour} from "../lib/energy/berlin.ts";
import {buildEnergyWaterView} from "../lib/energy/water-view.ts";
import type {EnergyDayFile} from "../lib/energy/types.ts";

const SERIAL = "90E5B1B87088";
const HUM_KEY = `${SERIAL}:humidifier`;
const HEAT_KEY = `${SERIAL}:heater`;
const NOW_MS = Date.parse("2026-08-23T12:20:00.000Z");

function cellAt(
    view: NonNullable<ReturnType<typeof buildEnergyWaterView>>["today"],
    date: string,
    hour: number,
) {
    const index = view.columns.findIndex(
        (column) => column.hour === hour && berlinDateOnly(Date.parse(column.t)) === date,
    );
    assert.ok(index >= 0, `missing water column ${date} hour ${hour}`);
    return view.cells[index];
}

describe("energy water view", () => {
    it("turns humidifier duty seconds into liters without serials", () => {
        const hour = berlinHour(NOW_MS - 60 * 60 * 1000);
        const days = new Map<string, EnergyDayFile>([
            [
                "2026-08-23",
                {
                    date: "2026-08-23",
                    hours: {
                        [String(hour)]: {[HUM_KEY]: {"2": 3600}, [HEAT_KEY]: {"1": 3600}},
                    },
                },
            ],
        ]);
        const windows = buildEnergyWaterView({
            days,
            refs: new Map(),
            nowMs: NOW_MS,
        });
        assert.ok(windows);
        const text = JSON.stringify(windows);
        assert.equal(text.includes(SERIAL), false);
        assert.equal(text.includes("serial"), false);
        const cell = cellAt(windows.today, "2026-08-23", hour);
        assert.equal(cell.liters, 0.27);
        assert.equal(cell.empty, false);
        assert.equal(windows.today.liters, 0.3);
        assert.equal(windows.today.kind, "hour");
        assert.equal(windows["7d"].kind, "slot6h");
        assert.equal(windows["30d"].kind, "day");
        assert.equal(windows["30d"].cells.length, 30);
        assert.equal(windows.grow.kind, "day");
        assert.equal(windows["7d"].liters, 0.3);
        assert.equal(windows["30d"].liters, 0.3);
    });

    it("does not count EMPTY alert seconds as water", () => {
        const hour = berlinHour(NOW_MS);
        const days = new Map<string, EnergyDayFile>([
            [
                "2026-08-23",
                {
                    date: "2026-08-23",
                    hours: {},
                    alerts: {
                        [String(hour)]: {[HUM_KEY]: {"4": 3600}},
                    },
                },
            ],
        ]);
        const windows = buildEnergyWaterView({
            days,
            refs: new Map(),
            nowMs: NOW_MS,
        });
        assert.ok(windows);
        const cell = cellAt(windows.today, "2026-08-23", hour);
        assert.equal(cell.liters, 0);
        assert.equal(cell.empty, true);
        assert.equal(windows.today.liters, 0);
    });

    it("returns null when no humidifier is in the window", () => {
        const hour = berlinHour(NOW_MS);
        const days = new Map<string, EnergyDayFile>([
            [
                "2026-08-23",
                {
                    date: "2026-08-23",
                    hours: {[String(hour)]: {[HEAT_KEY]: {"1": 3600}}},
                },
            ],
        ]);
        assert.equal(
            buildEnergyWaterView({
                days,
                refs: new Map(),
                nowMs: NOW_MS,
            }),
            null,
        );
    });

    it("wires the drip into the current scoreboard and /energy card", () => {
        const scoreboard = readFileSync(path.join(process.cwd(), "lib", "energy", "scoreboard.ts"), "utf8");
        const page = readFileSync(path.join(process.cwd(), "components", "energy-scoreboard.tsx"), "utf8");
        const drip = readFileSync(path.join(process.cwd(), "components", "energy-water.tsx"), "utf8");
        assert.match(scoreboard, /buildEnergyWaterView/);
        assert.match(page, /EnergyWater/);
        assert.match(drip, />Water Usage</);
        assert.match(drip, /label: "24h"/);
        assert.match(drip, /label: "7 days"/);
        assert.match(drip, /label: "This grow"/);
        assert.match(drip, /aria-label=\{label\}/);
        assert.match(drip, /stroke-zinc-200/);
        assert.match(drip, /group-hover:block/);
        assert.match(page, /onPointerDown/);
        assert.match(page, /onWindowKey=\{setWaterWindow\}/);
        assert.match(page, /group-hover:block/);
        assert.doesNotMatch(page, /onPointerMove/);
        assert.doesNotMatch(drip, /bg-zinc-200/);
        assert.doesNotMatch(drip, /tanks/);
    });
});
