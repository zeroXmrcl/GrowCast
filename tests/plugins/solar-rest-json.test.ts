import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {readModbusTcp, readRestJson, REST_CHANNELS} from "../../plugins/solar/host/rest-json.ts";

describe("REST JSON adapter", () => {
    it("maps REST channel JSON and skips missing channels", async () => {
        const calls: string[] = [];
        const client = {
            async getJson(url: string) {
                calls.push(url);
                if (url.endsWith("EssSoc")) {
                    return {value: 71};
                }
                if (url.endsWith("ProductionActivePower")) {
                    return {value: 6240};
                }
                if (url.endsWith("EssDischargePower")) {
                    throw new Error("timeout");
                }
                return {value: null};
            },
        };
        const metrics = await readRestJson({host: "example.local", password: "user"}, client);
        assert.equal(metrics["battery.soc"], 71);
        assert.equal(metrics["pv.power"], 6240);
        assert.equal("battery.power" in metrics, false);
        assert.ok(calls.some((url) => url.includes("/rest/channel/_sum/EssSoc")));
        assert.equal(Object.keys(REST_CHANNELS).length > 5, true);
    });

    it("never substitutes 0 for a missing Modbus register", async () => {
        const metrics = await readModbusTcp({
            "pv.power": 1200,
            "battery.soc": null,
        });
        assert.equal(metrics["pv.power"], 1200);
        assert.equal("battery.soc" in metrics, false);
    });
});
