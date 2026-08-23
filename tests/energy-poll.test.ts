import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    ENERGY_POLL_MS,
    ENERGY_POLL_PATH,
    fetchEnergyDto,
    parseEnergyPollBody,
    shouldPollEnergy,
} from "../lib/energy/poll.ts";

const sample = {
    grow: "current",
    estimated: true as const,
    tariffKind: "public" as const,
    appliedTariffEurPerKwh: 0.3,
    startedAt: null,
    empty: false,
    nowWatts: 40,
    nowWattsStale: false,
    windows: {
        today: {kWh: 0.1, costEur: 0.03},
        "7d": {kWh: 0.1, costEur: 0.03},
        "30d": {kWh: 0.1, costEur: 0.03},
        grow: {kWh: 0.1, costEur: 0.03},
    },
    kWh: 0.1,
    costEur: 0.03,
    devices: [],
};

describe("energy poll", () => {
    it("uses a 60s interval and current-grow path", () => {
        assert.equal(ENERGY_POLL_MS, 60_000);
        assert.equal(ENERGY_POLL_PATH, "/api/data/energy?grow=current");
    });

    it("parses a public energy DTO and rejects error bodies", () => {
        const parsed = parseEnergyPollBody(sample);
        assert.ok(parsed);
        assert.equal(parsed.nowWatts, 40);
        assert.equal(parseEnergyPollBody({error: "Not found"}), null);
        assert.equal(parseEnergyPollBody({estimated: true, grow: "current"}), null);
        assert.equal(parseEnergyPollBody(null), null);
    });

    it("returns the DTO on 200 and null on failure", async () => {
        const ok = await fetchEnergyDto(async (input, init) => {
            assert.equal(String(input), ENERGY_POLL_PATH);
            assert.equal(init?.credentials, "same-origin");
            assert.equal(init?.cache, "no-store");
            return new Response(JSON.stringify(sample), {status: 200});
        });
        assert.equal(ok?.nowWatts, 40);

        const failed = await fetchEnergyDto(async () => new Response(null, {status: 500}));
        assert.equal(failed, null);

        const invalid = await fetchEnergyDto(
            async () => new Response(JSON.stringify({error: "Unavailable"}), {status: 200}),
        );
        assert.equal(invalid, null);

        const threw = await fetchEnergyDto(async () => {
            throw new Error("offline");
        });
        assert.equal(threw, null);
    });

    it("does not poll while the tab is hidden", () => {
        assert.equal(shouldPollEnergy(true), true);
        assert.equal(shouldPollEnergy(false), false);
    });
});
