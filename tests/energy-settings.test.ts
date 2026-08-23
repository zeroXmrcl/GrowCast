import assert from "node:assert/strict";
import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {lookupWatts} from "../lib/energy/catalog.ts";
import {energySettingsFile} from "../lib/energy/paths.ts";
import {
    parseEnergySettings,
    parseEnergySettingsForm,
    readEnergySettings,
    writeEnergySettings,
    _resetEnergySettingsLogForTests,
} from "../lib/energy/settings.ts";

async function withTempDataDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "growcast-energy-settings-"));
    const previous = process.env.GROWCAST_DATA_DIR;
    process.env.GROWCAST_DATA_DIR = dir;
    _resetEnergySettingsLogForTests();
    try {
        return await fn(dir);
    } finally {
        if (previous === undefined) {
            delete process.env.GROWCAST_DATA_DIR;
        } else {
            process.env.GROWCAST_DATA_DIR = previous;
        }
        await rm(dir, {recursive: true, force: true});
    }
}

function formFrom(entries: Record<string, string> | Array<[string, string]>): FormData {
    const form = new FormData();
    const list = Array.isArray(entries) ? entries : Object.entries(entries);
    for (const [key, value] of list) {
        form.append(key, value);
    }
    return form;
}

describe("energy settings parse", () => {
    it("rejects negative and NaN tariffs", () => {
        const negative = parseEnergySettingsForm(
            formFrom({
                energyPublicTariff: "-0.1",
                energyPrivateTariff: "0.3",
            }),
        );
        assert.equal(negative.ok, false);

        const nan = parseEnergySettingsForm(
            formFrom({
                energyPublicTariff: "0.3",
                energyPrivateTariff: "nope",
            }),
        );
        assert.equal(nan.ok, false);
    });

    it("treats empty tariff strings as unset, not 0", () => {
        const parsed = parseEnergySettingsForm(
            formFrom({
                energyPublicTariff: "",
                energyPrivateTariff: "",
            }),
        );
        assert.equal(parsed.ok, true);
        if (parsed.ok && parsed.settings) {
            assert.equal(parsed.settings.publicTariffEurPerKwh, null);
            assert.equal(parsed.settings.privateTariffEurPerKwh, null);
        }
    });

    it("treats an empty watts override as catalog (unset, not 0)", () => {
        const parsed = parseEnergySettingsForm(
            formFrom([
                ["energyPublicTariff", "0.3"],
                ["energyPrivateTariff", "0.32"],
                ["energyOverrideKey", "90E5B1B87088:heater"],
                ["energyOverrideWatts", ""],
            ]),
        );
        assert.equal(parsed.ok, true);
        if (parsed.ok && parsed.settings) {
            assert.equal(parsed.settings.overrides.length, 0);
        }
        assert.equal(
            lookupWatts({
                key: "90E5B1B87088:heater",
                kind: "heater",
                id: "heater",
                level: "1",
                on: true,
                overrides: [],
            }),
            41,
        );
    });

    it("uses 0 W when neither catalog nor override matches", () => {
        assert.equal(
            lookupWatts({
                key: "90E5B1B87088:outlet-1",
                kind: "outlet",
                id: "outlet-1",
                level: "1",
                on: true,
                overrides: [],
            }),
            0,
        );
    });

    it("keeps wattsByLevel when the form only clears watts-when-on", () => {
        const parsed = parseEnergySettingsForm(
            formFrom([
                ["energyPublicTariff", "0.3"],
                ["energyPrivateTariff", ""],
                ["energyOverrideKey", "90E5B1B87088:heater"],
                ["energyOverrideWatts", ""],
            ]),
            {
                publicTariffEurPerKwh: 0.3,
                privateTariffEurPerKwh: null,
                overrides: [{key: "90E5B1B87088:heater", watts: 90, wattsByLevel: {"1": 80}}],
            },
        );
        assert.equal(parsed.ok, true);
        if (parsed.ok && parsed.settings) {
            assert.deepEqual(parsed.settings.overrides, [
                {key: "90E5B1B87088:heater", wattsByLevel: {"1": 80}},
            ]);
        }
    });

    it("ignores energy when the form has no energy fields", () => {
        const parsed = parseEnergySettingsForm(formFrom({name: "Grow"}));
        assert.equal(parsed.ok, true);
        if (parsed.ok) {
            assert.equal(parsed.settings, undefined);
        }
    });

    it("treats invalid on-disk settings as blank tariffs and no overrides", async () => {
        await withTempDataDir(async () => {
            const file = energySettingsFile();
            await mkdir(path.dirname(file), {recursive: true});
            await writeFile(file, '{"publicTariffEurPerKwh":-1}', "utf8");
            const settings = await readEnergySettings();
            assert.equal(settings.publicTariffEurPerKwh, null);
            assert.deepEqual(settings.overrides, []);
        });
    });

    it("round-trips valid settings and omits unset tariff keys", async () => {
        await withTempDataDir(async () => {
            await writeEnergySettings({
                publicTariffEurPerKwh: 0.3,
                privateTariffEurPerKwh: null,
                overrides: [{key: "90E5B1B87088:outlet-1", watts: 40}],
            });
            const read = await readEnergySettings();
            assert.equal(read.publicTariffEurPerKwh, 0.3);
            assert.equal(read.privateTariffEurPerKwh, null);
            assert.equal(read.overrides[0]?.watts, 40);
            assert.equal(parseEnergySettings({publicTariffEurPerKwh: 0.3, overrides: []})?.publicTariffEurPerKwh, 0.3);
        });
    });
});
