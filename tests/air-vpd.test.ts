import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {airVpdKPa} from "../lib/air-vpd.ts";

describe("airVpdKPa", () => {
    it("computes Magnus–Tetens air VPD near 1.71 at 25.3°C / 47.1%", () => {
        const vpd = airVpdKPa(25.3, 47.1);
        assert.ok(vpd !== null);
        assert.ok(Math.abs(vpd - 1.71) < 0.05);
    });

    it("returns null when either input is null or non-finite", () => {
        assert.equal(airVpdKPa(null, 47.1), null);
        assert.equal(airVpdKPa(25.3, null), null);
        assert.equal(airVpdKPa(undefined, 50), null);
        assert.equal(airVpdKPa(25, undefined), null);
        assert.equal(airVpdKPa(Number.NaN, 50), null);
        assert.equal(airVpdKPa(25, Number.POSITIVE_INFINITY), null);
    });
});
