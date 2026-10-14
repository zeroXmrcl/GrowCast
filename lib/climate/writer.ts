import {airVpdKPa} from "@/lib/air-vpd";
import {berlinDateOnly, shiftDateOnly} from "@/lib/energy/berlin";
import {GGS_FUTURE_SKEW_MS, toPublicLive, type GgsLiveIngest} from "@/lib/ggs-live";
import {climateMetricAlerts, pickClimateDevice} from "@/lib/live-climate-view";
import {
    CLIMATE_RETENTION_DAYS,
    CLIMATE_SLOT_MS,
    type ClimateDayFile,
    type ClimatePoint,
} from "@/lib/climate/types";
import {logClimate} from "@/lib/climate/log";
import {
    mergeClimatePoint,
    pruneClimateDays,
    readClimateDay,
    withClimateWriteLock,
    writeClimateDay,
} from "@/lib/climate/store";

function finiteNumber(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function climateSlotStartMs(ms: number): number {
    return Math.floor(ms / CLIMATE_SLOT_MS) * CLIMATE_SLOT_MS;
}

export function climateEventTimeMs(updatedAt: string, serverNowMs: number): number {
    const ts = Date.parse(updatedAt);
    if (!Number.isFinite(ts) || ts - serverNowMs > GGS_FUTURE_SKEW_MS) {
        return serverNowMs;
    }
    return ts;
}

export function climatePointFromIngest(
    snapshot: GgsLiveIngest,
    serverNowMs: number = Date.now(),
): ClimatePoint | null {
    const publicState = toPublicLive({
        pluginId: snapshot.pluginId,
        source: snapshot.source,
        updatedAt: snapshot.updatedAt,
        online: snapshot.online,
        stale: false,
        devices: snapshot.devices,
    });
    const device = pickClimateDevice(publicState);
    if (!device) {
        return null;
    }
    const tempC = finiteNumber(device.sensor.tempC);
    const humidityPct = finiteNumber(device.sensor.humidityPct);
    const vpd = airVpdKPa(tempC, humidityPct);
    if (tempC === null || humidityPct === null || vpd === null) {
        return null;
    }
    const alerts = climateMetricAlerts(publicState);
    const alarm = alerts.temp || alerts.humidity || alerts.vpd;
    const isDay = device.sensor.isDay;
    const slotMs = climateSlotStartMs(climateEventTimeMs(snapshot.updatedAt, serverNowMs));
    const point: ClimatePoint = {
        t: new Date(slotMs).toISOString(),
        tempC,
        humidityPct,
        vpd,
        co2: finiteNumber(device.sensor.co2),
        ppfd: finiteNumber(device.sensor.ppfd),
        isDay: typeof isDay === "boolean" ? isDay : null,
    };
    if (alarm) {
        point.alarm = true;
    }
    return point;
}

export function climateRetentionStartDate(todayDate: string): string {
    return shiftDateOnly(todayDate, -(CLIMATE_RETENTION_DAYS - 1));
}

export async function recordClimateOnIngest(
    snapshot: GgsLiveIngest,
    serverNowMs: number = Date.now(),
): Promise<void> {
    const point = climatePointFromIngest(snapshot, serverNowMs);
    if (!point) {
        return;
    }
    await withClimateWriteLock(async () => {
        const date = berlinDateOnly(Date.parse(point.t));
        const existing = (await readClimateDay(date)) ?? {date, points: [] satisfies ClimatePoint[]};
        const next: ClimateDayFile = mergeClimatePoint(existing, point);
        await writeClimateDay(next);
        await pruneClimateDays(climateRetentionStartDate(berlinDateOnly(serverNowMs)));
    });
}

export async function recordClimateOnIngestBestEffort(snapshot: GgsLiveIngest): Promise<void> {
    try {
        await recordClimateOnIngest(snapshot);
    } catch {
        logClimate("climate_write_failed");
    }
}
