import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {describe, it} from "node:test";
import {
    CLIMATE_TICK_EASING,
    DEFAULT_CLIMATE_TICK,
    climateTickDurationMs,
    climateTickIndex,
    climateTickLabels,
    parseClimateTick,
} from "../lib/climate-tick.ts";
import {normalizeGrowRecord} from "../lib/db.ts";
import {OVERLAY_EASING_ENTER} from "../lib/overlay-motion.ts";
import {parseOverlayGrowBody} from "../lib/overlay-grow.ts";

function src(rel: string): string {
    return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("parseClimateTick", () => {
    it("defaults missing and junk to plain and only accepts picker", () => {
        assert.equal(DEFAULT_CLIMATE_TICK, "plain");
        assert.equal(parseClimateTick(undefined), "plain");
        assert.equal(parseClimateTick(null), "plain");
        assert.equal(parseClimateTick(""), "plain");
        assert.equal(parseClimateTick("plain"), "plain");
        assert.equal(parseClimateTick("barrel"), "plain");
        assert.equal(parseClimateTick("peek"), "plain");
        assert.equal(parseClimateTick("picker"), "picker");
    });
});

describe("climate wheel detents", () => {
    it("uses overlay enter easing and 0.1 / 0.1 / 0.01 steps", () => {
        assert.equal(CLIMATE_TICK_EASING, OVERLAY_EASING_ENTER);
        const temp = climateTickLabels("temp");
        const rh = climateTickLabels("rh");
        const vpd = climateTickLabels("vpd");
        assert.equal(temp[0], "5.0°");
        assert.equal(temp[temp.length - 1], "45.0°");
        assert.equal(rh[0], "10.0%");
        assert.equal(rh[rh.length - 1], "99.9%");
        assert.equal(vpd[0], "0.20");
        assert.equal(vpd[vpd.length - 1], "4.00");
        assert.equal(temp[climateTickIndex("temp", 23.1)], "23.1°");
        assert.equal(temp[climateTickIndex("temp", 0)], "5.0°");
        assert.equal(temp[climateTickIndex("temp", 50)], "45.0°");
        assert.equal(rh[climateTickIndex("rh", 55.04)], "55.0%");
        assert.equal(vpd[climateTickIndex("vpd", 1.234)], "1.23");
    });

    it("caps spin duration and snaps under reduced motion", () => {
        assert.equal(climateTickDurationMs(0, false), 0);
        assert.equal(climateTickDurationMs(1, false), 255);
        assert.equal(climateTickDurationMs(20, false), 560);
        assert.equal(climateTickDurationMs(4, true), 0);
    });
});

describe("grow and overlay parse", () => {
    it("fills missing climateTick with plain and keeps picker", () => {
        assert.equal(normalizeGrowRecord({name: "Only Name"}).climateTick, "plain");
        assert.equal(normalizeGrowRecord({climateTick: "picker"}).climateTick, "picker");
        assert.equal(normalizeGrowRecord({climateTick: "barrel"}).climateTick, "plain");
        assert.equal(parseOverlayGrowBody({plant: "Basil"})?.climateTick, "plain");
        assert.equal(
            parseOverlayGrowBody({plant: "Basil", climateTick: "picker"})?.climateTick,
            "picker",
        );
    });
});

describe("overlay picker wiring", () => {
    it("keeps Current as the default overlay option and parks Picker on Broadcast Design", () => {
        const picker = src(path.join("components", "climate-picker.tsx"));
        const climate = src(path.join("components", "overlay-climate.tsx"));
        const hud = src(path.join("components", "overlay-hud.tsx"));
        const fields = src(path.join("app", "admin", "stream-fields.tsx"));
        const growFields = src(path.join("app", "admin", "settings-fields.tsx"));
        const css = src(path.join("app", "globals.css"));
        const homeCard = src(path.join("components", "live-climate-card.tsx"));
        const overlayPage = src(path.join("app", "overlay", "page.tsx"));
        const programPage = src(path.join("app", "program", "page.tsx"));
        const capturePage = src(path.join("app", "overlay", "capture", "page.tsx"));
        const scene = src(path.join("components", "program-scene.tsx"));

        assert.match(picker, /"use client"/);
        assert.match(picker, /useSyncExternalStore/);
        assert.match(picker, /prefers-reduced-motion/);
        assert.match(picker, /translateY/);
        assert.doesNotMatch(picker, /filter:/);
        assert.doesNotMatch(picker, /cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\)/);

        assert.match(climate, /ClimatePickerValue/);
        assert.match(climate, /climateTick === "picker"/);
        assert.match(climate, /climateTick = "plain"/);
        assert.match(climate, /formatTempC/);
        assert.match(climate, /formatHumidityPctTenths/);

        assert.match(hud, /climateTick=\{grow\.climateTick\}/);
        assert.match(overlayPage, /climateTick=\{grow\.climateTick\}/);
        assert.match(programPage, /climateTick=\{grow\.climateTick\}/);
        assert.match(capturePage, /climateTick=\{grow\.climateTick\}/);
        assert.match(scene, /climateTick=\{climateTick\}/);

        assert.match(fields, /id="design"/);
        assert.match(fields, /title="Design"/);
        assert.match(fields, /name="climateTick"\s+form=\{growForm\}/);
        assert.match(fields, /value="plain"/);
        assert.match(fields, /value="picker"/);
        assert.match(fields, />\s*Current\s*</);
        assert.match(fields, />\s*Picker\s*</);
        assert.doesNotMatch(fields, /value="peek"|value="barrel"/);
        assert.doesNotMatch(growFields, /name="climateTick"/);

        assert.match(css, /growcast-climate-wheel/);
        assert.match(css, /growcast-climate-wheel-strip/);
        assert.doesNotMatch(homeCard, /ClimatePickerValue/);
        assert.doesNotMatch(homeCard, /climateTick/);
    });
});
