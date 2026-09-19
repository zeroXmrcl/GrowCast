import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {mkdtemp, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {buildEnergyArchivePayload} from "../lib/energy/archive.ts";
import {_resetEnergyAccrueLockForTests} from "../lib/energy/accrue.ts";
import {berlinDateOnly, berlinHour} from "../lib/energy/berlin.ts";
import {buildEnergyFlowView} from "../lib/energy/flow-view.ts";
import {totalsForDays} from "../lib/energy/math.ts";
import {writeEnergyCursor, writeEnergyDay} from "../lib/energy/store.ts";
import type {EnergyDayFile} from "../lib/energy/types.ts";

const SERIAL = "90E5B1B87088";
const HUM_KEY = `${SERIAL}:humidifier`;
const HEAT_KEY = `${SERIAL}:heater`;
const NOW_MS = Date.parse("2026-08-23T12:20:00.000Z");

async function withTempDataDir<T>(fn: () => Promise<T>): Promise<T> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "growcast-energy-flow-"));
    const previous = process.env.GROWCAST_DATA_DIR;
    process.env.GROWCAST_DATA_DIR = dir;
    _resetEnergyAccrueLockForTests();
    try {
        return await fn();
    } finally {
        _resetEnergyAccrueLockForTests();
        if (previous === undefined) {
            delete process.env.GROWCAST_DATA_DIR;
        } else {
            process.env.GROWCAST_DATA_DIR = previous;
        }
        await rm(dir, {recursive: true, force: true});
    }
}

function cellAt(
    view: ReturnType<typeof buildEnergyFlowView>,
    id: string,
    date: string,
    hour: number,
) {
    const index = view.columns.findIndex(
        (column) => column.hour === hour && berlinDateOnly(Date.parse(column.t)) === date,
    );
    const row = view.rows.find((item) => item.id === id);
    assert.ok(row, `missing flow row ${id}`);
    assert.ok(index >= 0, `missing flow column ${date} hour ${hour}`);
    return row.cells[index];
}

describe("energy flow view", () => {
    it("maps hour duty and alert fractions without serials", () => {
        const currentHour = berlinHour(NOW_MS);
        const previousHour = berlinHour(NOW_MS - 60 * 60 * 1000);
        const days = new Map<string, EnergyDayFile>([
            [
                "2026-08-23",
                {
                    date: "2026-08-23",
                    hours: {
                        [String(previousHour)]: {[HEAT_KEY]: {"1": 3600}},
                    },
                    alerts: {
                        [String(currentHour)]: {[HUM_KEY]: {"4": 1200}},
                    },
                },
            ],
        ]);
        const view = buildEnergyFlowView({
            days,
            refs: new Map(),
            nowMs: NOW_MS,
        });
        const text = JSON.stringify(view);
        assert.equal(text.includes(SERIAL), false);
        assert.equal(text.includes("serial"), false);

        const heater = cellAt(view, "heater", "2026-08-23", previousHour);
        assert.equal(heater.duty, 1);
        assert.equal(heater.alert, 0);
        assert.equal(heater.mark, null);

        const humidifier = cellAt(view, "humidifier", "2026-08-23", currentHour);
        assert.equal(humidifier.duty, 0);
        assert.equal(humidifier.alert, 1);
        assert.equal(humidifier.mark, "EMPTY");
    });

    it("does not count alert seconds as kWh", () => {
        const totals = totalsForDays(
            [
                {
                    date: "2026-08-23",
                    hours: {},
                    alerts: {"14": {[HUM_KEY]: {"4": 3600}}},
                },
            ],
            null,
            new Map(),
            [],
        );
        assert.equal(totals.kWh, 0);
        assert.equal(totals.seconds, 0);
    });

    it("keeps live actuator order and lists leftover keys after", () => {
        const currentHour = berlinHour(NOW_MS);
        const days = new Map<string, EnergyDayFile>([
            [
                "2026-08-23",
                {
                    date: "2026-08-23",
                    hours: {
                        [String(currentHour)]: {
                            [HEAT_KEY]: {"1": 60},
                            [`AABBCCDDEEFF:fan`]: {"1": 60},
                        },
                    },
                },
            ],
        ]);
        const view = buildEnergyFlowView({
            days,
            refs: new Map(),
            liveDevices: [
                {
                    serial: SERIAL,
                    name: "Tent Controller",
                    prefix: "CB",
                    productType: "SF-GGS-CB",
                    online: true,
                    sensor: {
                        tempC: null,
                        humidityPct: null,
                        vpd: null,
                        co2: null,
                        ppfd: null,
                        tempSoilC: null,
                        humiditySoilPct: null,
                        ecSoil: null,
                    },
                    actuators: [
                        {id: "humidifier", label: "Humidifier", kind: "humidifier", on: false, level: 0, alarm: 4},
                        {id: "heater", label: "Heater", kind: "heater", on: true, level: 1, alarm: null},
                    ],
                },
            ],
            nowMs: NOW_MS,
        });
        assert.deepEqual(
            view.rows.map((row) => row.id),
            ["humidifier", "heater", "fan"],
        );
        assert.equal(JSON.stringify(view).includes("AABBCCDDEEFF"), false);
    });

    it("copies alert buckets into a completed grow archive", async () => {
        await withTempDataDir(async () => {
            await writeEnergyCursor({
                growId: "grow-001",
                startedAt: "2026-08-23T08:00:00.000Z",
                lastAccruedAt: "2026-08-23T10:00:00.000Z",
                devices: [],
            });
            await writeEnergyDay({
                date: "2026-08-23",
                hours: {"12": {[HEAT_KEY]: {"1": 100}}},
                alerts: {"12": {[HUM_KEY]: {"4": 40}}},
            });
            const payload = await buildEnergyArchivePayload("grow-001", "2026-08-23T12:00:00.000Z");
            assert.equal(payload.days["2026-08-23"]?.hours["12"][HEAT_KEY]["1"], 100);
            assert.equal(payload.days["2026-08-23"]?.alerts?.["12"][HUM_KEY]["4"], 40);
        });
    });

    it("wires the flow view into the current scoreboard and /energy card", () => {
        const scoreboard = readFileSync(path.join(process.cwd(), "lib", "energy", "scoreboard.ts"), "utf8");
        const page = readFileSync(path.join(process.cwd(), "components", "energy-scoreboard.tsx"), "utf8");
        const map = readFileSync(path.join(process.cwd(), "components", "energy-flowmap.tsx"), "utf8");
        assert.match(scoreboard, /buildEnergyFlowView/);
        assert.match(scoreboard, /flow: buildEnergyFlowView/);
        assert.match(page, /EnergyFlowmap/);
        assert.match(page, /label: "24h"/);
        assert.match(page, /title="24h"/);
        assert.doesNotMatch(page, /Today/);
        assert.doesNotMatch(map, /Last 24 hours/);
        assert.doesNotMatch(map, /Tent/);
    });
});
