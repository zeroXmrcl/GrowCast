import {airVpdKPa} from "@/lib/air-vpd";
import {
    GGS_STALE_AFTER_MS,
    type GgsActuator,
    type GgsActuatorKind,
    type GgsLivePublic,
    type GgsPublicDevice,
} from "@/lib/ggs-live";

export type LiveClimateMetrics = {
    tempC: number | null;
    humidityPct: number | null;
    vpd: number | null;
};

export type LiveDeviceTile = {
    id: string;
    kind: GgsActuatorKind;
    label: string;
    running: boolean;
    levelText: string;
    accessibleName: string;
};

export type ClimateBadge =
    | {kind: "live"; text: "LIVE"}
    | {kind: "stale"; text: string};

function finiteNumber(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function shouldShowLiveRow(
    snapshot: GgsLivePublic | null | undefined,
): snapshot is GgsLivePublic {
    if (!snapshot || snapshot.updatedAt == null || snapshot.updatedAt === "") {
        return false;
    }
    return Array.isArray(snapshot.devices) && snapshot.devices.length > 0;
}

function snapshotTimeMs(snapshot: GgsLivePublic): number | null {
    if (snapshot.updatedAt == null || snapshot.updatedAt === "") {
        return null;
    }
    const ms = Date.parse(snapshot.updatedAt);
    return Number.isFinite(ms) ? ms : null;
}

export function preferLiveSnapshot(
    current: GgsLivePublic | null,
    incoming: GgsLivePublic,
): GgsLivePublic {
    if (!current) {
        return incoming;
    }
    const currentMs = snapshotTimeMs(current);
    const incomingMs = snapshotTimeMs(incoming);
    if (currentMs !== null && incomingMs === null) {
        return current;
    }
    if (currentMs !== null && incomingMs !== null && incomingMs < currentMs) {
        return current;
    }
    return incoming;
}

export function isClimateStale(
    snapshot: Pick<GgsLivePublic, "stale" | "updatedAt"> | null,
    nowMs: number,
    lastEventAtMs: number | null,
): boolean {
    if (!snapshot) {
        return true;
    }
    if (snapshot.stale) {
        return true;
    }
    const updatedMs = snapshot.updatedAt ? Date.parse(snapshot.updatedAt) : Number.NaN;
    if (!Number.isFinite(updatedMs) || nowMs - updatedMs >= GGS_STALE_AFTER_MS) {
        return true;
    }
    if (lastEventAtMs !== null && nowMs - lastEventAtMs >= GGS_STALE_AFTER_MS) {
        return true;
    }
    return false;
}

export function pickClimateDevice(snapshot: GgsLivePublic): GgsPublicDevice | null {
    for (const device of snapshot.devices) {
        if (device.prefix !== "CB" || !device.sensor) {
            continue;
        }
        if (
            finiteNumber(device.sensor.tempC) !== null ||
            finiteNumber(device.sensor.humidityPct) !== null
        ) {
            return device;
        }
    }
    return null;
}

export function climateMetrics(snapshot: GgsLivePublic): LiveClimateMetrics {
    const device = pickClimateDevice(snapshot);
    if (!device) {
        return {tempC: null, humidityPct: null, vpd: null};
    }
    const tempC = finiteNumber(device.sensor.tempC);
    const humidityPct = finiteNumber(device.sensor.humidityPct);
    return {
        tempC,
        humidityPct,
        vpd: airVpdKPa(tempC, humidityPct),
    };
}

export function formatTempC(value: number | null): string {
    return value === null ? "—" : `${value.toFixed(1)}°`;
}

export function formatHumidityPct(value: number | null): string {
    return value === null ? "—" : `${Math.round(value)}%`;
}

export function formatVpd(value: number | null): string {
    return value === null ? "—" : value.toFixed(2);
}

export function formatRelativeAge(updatedAt: string | null, nowMs: number): string {
    if (!updatedAt) {
        return "";
    }
    const ts = Date.parse(updatedAt);
    if (!Number.isFinite(ts)) {
        return "";
    }
    const seconds = Math.max(0, Math.floor((nowMs - ts) / 1000));
    if (seconds < 60) {
        return `${seconds}s ago`;
    }
    return `${Math.floor(seconds / 60)}m ago`;
}

export function climateBadge(
    stale: boolean,
    updatedAt: string | null,
    nowMs: number,
): ClimateBadge {
    if (!stale) {
        return {kind: "live", text: "LIVE"};
    }
    const relative = formatRelativeAge(updatedAt, nowMs);
    return {kind: "stale", text: relative ? `stale · ${relative}` : "stale"};
}

export function actuatorLabel(actuator: Pick<GgsActuator, "id" | "kind" | "label">): string {
    if (actuator.kind === "light" && actuator.id === "light2") {
        return "Light 2";
    }
    if (actuator.kind === "outlet") {
        const match = /^outlet-(.+)$/i.exec(actuator.id);
        return match ? `Outlet ${match[1]}` : "Outlet";
    }
    switch (actuator.kind) {
        case "light":
            return "Light";
        case "fan":
            return "Fan";
        case "blower":
            return "Blower";
        case "humidifier":
            return "Humidifier";
        case "dehumidifier":
            return "Dehumidifier";
        case "heater":
            return "Heater";
        default:
            return actuator.label;
    }
}

function tileLevelText(actuator: GgsActuator): string {
    const level = finiteNumber(actuator.level);
    if (level !== null) {
        const rounded = Math.round(level);
        return rounded === 0 ? "OFF" : `${rounded}%`;
    }
    return actuator.on ? "on" : "off";
}

function tileAccessibleName(label: string, actuator: GgsActuator): string {
    const caption = tileLevelText(actuator);
    if (caption === "OFF") {
        return `${label}: OFF`;
    }
    if (!actuator.on) {
        return `${label}: off`;
    }
    if (finiteNumber(actuator.level) !== null) {
        return `${label}: on ${caption}`;
    }
    return `${label}: on`;
}

export function mapDeviceTiles(snapshot: GgsLivePublic): LiveDeviceTile[] {
    const device = pickClimateDevice(snapshot);
    if (!device || !Array.isArray(device.actuators)) {
        return [];
    }
    return device.actuators.map((actuator) => {
        const label = actuatorLabel(actuator);
        return {
            id: actuator.id,
            kind: actuator.kind,
            label,
            running: actuator.on,
            levelText: tileLevelText(actuator),
            accessibleName: tileAccessibleName(label, actuator),
        };
    });
}
