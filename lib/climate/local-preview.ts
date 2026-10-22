import {airVpdKPa} from "@/lib/air-vpd";
import {buildClimateHistory} from "@/lib/climate/history-windows";
import type {ClimateDayFile, ClimateHistoryPublic, ClimatePoint} from "@/lib/climate/history-public";
import {isDateOnly} from "@/lib/date-only";
import {berlinDateOnly, shiftDateOnly} from "@/lib/energy/berlin";
import {GGS_PLUGIN_ID, type GgsLivePublic} from "@/lib/ggs-live";

const EMPTY_SEED = "2001-01-01";
const LIVE_TEMP_C = 25.4;
const LIVE_HUMIDITY_PCT = 62.8;
const STEP_MS = 15 * 60 * 1000;
const SPAN_MS = 80 * 24 * 60 * 60 * 1000;

/** Sample climate when this process is a local dev server and GGS has not posted. */
export function localClimatePreviewEnabled(env: NodeJS.ProcessEnv): boolean {
    const flag = `${env.GROWCAST_CLIMATE_PREVIEW ?? ""}`.trim().toLowerCase();
    if (flag === "0" || flag === "false") {
        return false;
    }
    if (flag === "1" || flag === "true") {
        return true;
    }
    const name = `${env.GROWCAST_ENV ?? ""}`.trim().toLowerCase() || `${env.NODE_ENV ?? ""}`.trim().toLowerCase();
    return name === "development" || name === "dev";
}

export function climatePreviewSnapshot(nowMs = Date.now()): GgsLivePublic {
    return {
        pluginId: GGS_PLUGIN_ID,
        source: "ggs-cloud",
        updatedAt: new Date(nowMs).toISOString(),
        online: true,
        stale: false,
        devices: [
            {
                name: "Sample",
                prefix: "CB",
                productType: "Controller",
                online: true,
                sensor: {
                    tempC: LIVE_TEMP_C,
                    humidityPct: LIVE_HUMIDITY_PCT,
                    vpd: airVpdKPa(LIVE_TEMP_C, LIVE_HUMIDITY_PCT),
                    co2: null,
                    ppfd: null,
                    tempSoilC: null,
                    humiditySoilPct: null,
                    ecSoil: null,
                    isDay: true,
                },
                actuators: [
                    {id: "light", label: "Light", kind: "light", on: true, level: 80, alarm: null},
                ],
                alarmLast: null,
            },
        ],
    };
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function round(value: number, digits: number): number {
    const scale = 10 ** digits;
    return Math.round(value * scale) / scale;
}

function previewPoint(ms: number, nowMs: number): ClimatePoint {
    const ageH = (nowMs - ms) / 3_600_000;
    const ageD = ageH / 24;
    const daily = Math.sin((ageH * Math.PI) / 12);
    const week = ageD <= 7 ? Math.sin((ageD / 7) * Math.PI) : 0;
    const cliff = ageD > 14 ? 1 : 0;
    const drift = ageD / 80;
    const tempC = clamp(LIVE_TEMP_C + daily * 2.4 + week * -3.2 + cliff * 3.8 - drift * 1.5, 16, 34);
    const humidityPct = clamp(LIVE_HUMIDITY_PCT - daily * 7 + week * 9 - cliff * 8 + drift * 6, 30, 95);
    const vpd = airVpdKPa(tempC, humidityPct) ?? 0;
    return {
        t: new Date(ms).toISOString(),
        tempC: round(tempC, 2),
        humidityPct: round(humidityPct, 2),
        vpd: round(vpd, 3),
    };
}

function keepSample(ms: number, nowMs: number): boolean {
    const ageH = (nowMs - ms) / 3_600_000;
    const ageD = ageH / 24;
    if (ageH > 30 && ageH < 42) {
        return false;
    }
    if (ageD > 16 && ageD < 18) {
        return false;
    }
    return true;
}

function previewSeed(nowMs: number, seededAt: string): string {
    if (isDateOnly(seededAt) && seededAt !== EMPTY_SEED) {
        return seededAt;
    }
    return shiftDateOnly(berlinDateOnly(nowMs), -70);
}

/** Four ranges with different shapes, ending on the sample card values. */
export function climatePreviewHistory(nowMs: number, seededAt: string): ClimateHistoryPublic {
    const points: ClimatePoint[] = [];
    for (let ms = nowMs - SPAN_MS; ms < nowMs; ms += STEP_MS) {
        if (keepSample(ms, nowMs)) {
            points.push(previewPoint(ms, nowMs));
        }
    }
    points.push(previewPoint(nowMs, nowMs));
    const days = new Map<string, ClimateDayFile>();
    days.set("preview", {date: berlinDateOnly(nowMs), points});
    return buildClimateHistory(days, nowMs, previewSeed(nowMs, seededAt));
}
