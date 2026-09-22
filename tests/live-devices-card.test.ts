import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {describe, it} from "node:test";
import {deviceGaugePercent} from "../lib/device-gauge.ts";
import type {LiveDeviceTile} from "../lib/live-climate-view.ts";

function tile(partial: Partial<LiveDeviceTile>): LiveDeviceTile {
    return {
        id: "fan",
        kind: "fan",
        label: "Fan",
        running: false,
        alerting: false,
        levelText: "OFF",
        accessibleName: "Fan: OFF",
        ...partial,
    };
}

describe("deviceGaugePercent", () => {
    it("parks the needle for off and for faults", () => {
        assert.equal(deviceGaugePercent(tile({levelText: "OFF"})), 0);
        assert.equal(deviceGaugePercent(tile({running: true, alerting: true, levelText: "EMPTY"})), 0);
        assert.equal(deviceGaugePercent(tile({running: true, alerting: true, levelText: "HOT"})), 0);
    });

    it("uses the percent caption when the actuator is drawing", () => {
        assert.equal(deviceGaugePercent(tile({running: true, levelText: "35%"})), 35);
        assert.equal(deviceGaugePercent(tile({running: true, levelText: "10%"})), 10);
        assert.equal(deviceGaugePercent(tile({running: true, levelText: "LOW"})), 50);
        assert.equal(deviceGaugePercent(tile({running: true, levelText: "HIGH"})), 100);
    });
});

describe("live devices card wiring", () => {
    it("draws a half-circle needle gauge with the value under the arc", () => {
        const src = readFileSync(
            path.join(process.cwd(), "components", "live-devices-card.tsx"),
            "utf8",
        );
        assert.match(src, /deviceGaugePercent/);
        assert.match(src, /flex w-full flex-1 items-center/);
        assert.match(src, /DeviceIcon/);
        assert.match(src, /growcast-turbine-power/);
        assert.match(src, /tile\.levelText[\s\S]*tile\.label/);
        assert.match(src, /\btruncate\b/);
    });

    it("does not change overlay gear wrapping", () => {
        const src = readFileSync(
            path.join(process.cwd(), "components", "overlay-gear.tsx"),
            "utf8",
        );
        assert.match(src, /flex flex-wrap gap-2/);
        assert.equal(src.includes("lg:flex-nowrap"), false);
        assert.equal(src.includes("liveDeviceRowItems"), false);
        assert.match(src, /growcast-alert-pulse/);
        assert.match(src, /tile\.alerting/);
    });
});

describe("turbine gauge motion", () => {
    it("eases the needle and arc, and holds still when motion is reduced", () => {
        const src = readFileSync(path.join(process.cwd(), "app", "globals.css"), "utf8");
        assert.match(src, /\.growcast-turbine-power/);
        assert.match(src, /\.growcast-turbine-mark/);
        assert.match(src, /stroke-dashoffset 360ms cubic-bezier\(0\.16, 1, 0\.3, 1\)/);
        assert.match(src, /transform 360ms cubic-bezier\(0\.16, 1, 0\.3, 1\)/);
        assert.match(src, /prefers-reduced-motion: reduce/);
    });
});
