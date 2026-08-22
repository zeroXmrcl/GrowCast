import {asBoolean, asString, isRecord} from "@/lib/coerce";
import {GGS_PLUGIN_ID} from "@/lib/mesh-plugins";

export {GGS_PLUGIN_ID};
export const GGS_STALE_AFTER_MS = 120_000;
export const GGS_HEARTBEAT_MS = 15_000;
export const GGS_MAX_DEVICES = 20;
export const GGS_MAX_SERIAL = 32;
export const GGS_MAX_NAME = 80;
export const GGS_FUTURE_SKEW_MS = 5 * 60_000;

export type GgsActuatorKind =
    | "light"
    | "fan"
    | "blower"
    | "humidifier"
    | "dehumidifier"
    | "heater"
    | "outlet";

export type GgsActuator = {
    id: string;
    label: string;
    kind: GgsActuatorKind;
    on: boolean;
    level: number | null;
};

export type GgsSensor = {
    tempC: number | null;
    humidityPct: number | null;
    vpd: number | null;
    co2: number | null;
    ppfd: number | null;
    tempSoilC: number | null;
    humiditySoilPct: number | null;
    ecSoil: number | null;
};

export type GgsPrefix = "CB" | "PS" | "LC";

export type GgsDeviceSnapshot = {
    serial: string;
    name: string;
    prefix: GgsPrefix;
    productType: string;
    online: boolean;
    sensor: GgsSensor;
    actuators: GgsActuator[];
};

export type GgsLiveIngest = {
    pluginId: typeof GGS_PLUGIN_ID;
    source: "ggs-cloud";
    updatedAt: string;
    online: boolean;
    devices: GgsDeviceSnapshot[];
};

export type GgsLivePublic = Omit<GgsLiveIngest, "updatedAt"> & {
    stale: boolean;
    updatedAt: string | null;
};

export const EMPTY_LIVE_PUBLIC: GgsLivePublic = {
    pluginId: GGS_PLUGIN_ID,
    source: "ggs-cloud",
    updatedAt: null,
    online: false,
    stale: true,
    devices: [],
};

const SECRET_KEYS = new Set([
    "password",
    "passwd",
    "token",
    "mqttPwd",
    "mqttName",
    "mqtt_password",
    "authorization",
    "secret",
]);

const KINDS = new Set<GgsActuatorKind>([
    "light",
    "fan",
    "blower",
    "humidifier",
    "dehumidifier",
    "heater",
    "outlet",
]);

export type ParseResult =
    | {ok: true; value: GgsLiveIngest}
    | {ok: false; error: string};

function optionalFinite(value: unknown): number | null | undefined {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string" && value.trim() !== "") {
        const n = Number(value);
        if (Number.isFinite(n)) {
            return n;
        }
    }
    return undefined;
}

function parseSensor(raw: unknown): GgsSensor | null {
    if (!isRecord(raw)) {
        return null;
    }
    const tempC = optionalFinite(raw.tempC);
    const humidityPct = optionalFinite(raw.humidityPct);
    const vpd = optionalFinite(raw.vpd);
    const co2 = optionalFinite(raw.co2);
    const ppfd = optionalFinite(raw.ppfd);
    const tempSoilC = optionalFinite(raw.tempSoilC);
    const humiditySoilPct = optionalFinite(raw.humiditySoilPct);
    const ecSoil = optionalFinite(raw.ecSoil);
    if (
        tempC === undefined ||
        humidityPct === undefined ||
        vpd === undefined ||
        co2 === undefined ||
        ppfd === undefined ||
        tempSoilC === undefined ||
        humiditySoilPct === undefined ||
        ecSoil === undefined
    ) {
        return null;
    }
    return {tempC, humidityPct, vpd, co2, ppfd, tempSoilC, humiditySoilPct, ecSoil};
}

function parseActuator(raw: unknown): GgsActuator | null {
    if (!isRecord(raw)) {
        return null;
    }
    const id = asString(raw.id, "").trim();
    const label = asString(raw.label, "").trim();
    const kind = asString(raw.kind, "").trim() as GgsActuatorKind;
    if (!id || id.length > 32 || !label || label.length > 40 || !KINDS.has(kind)) {
        return null;
    }
    const level = optionalFinite(raw.level ?? null);
    if (level === undefined) {
        return null;
    }
    return {id, label, kind, on: asBoolean(raw.on, false), level};
}

function parseDevice(raw: unknown): GgsDeviceSnapshot | null {
    if (!isRecord(raw)) {
        return null;
    }
    const serial = asString(raw.serial, "").replace(/:/g, "").toUpperCase();
    const name = asString(raw.name, "").trim();
    const prefix = asString(raw.prefix, "") as GgsPrefix;
    const productType = asString(raw.productType, "").trim();
    if (
        serial.length === 0 ||
        serial.length > GGS_MAX_SERIAL ||
        name.length === 0 ||
        name.length > GGS_MAX_NAME ||
        (prefix !== "CB" && prefix !== "PS" && prefix !== "LC") ||
        productType.length === 0 ||
        productType.length > 40
    ) {
        return null;
    }
    const sensor = parseSensor(raw.sensor);
    if (!sensor) {
        return null;
    }
    if (!Array.isArray(raw.actuators) || raw.actuators.length > 32) {
        return null;
    }
    const actuators: GgsActuator[] = [];
    for (const item of raw.actuators) {
        const parsed = parseActuator(item);
        if (!parsed) {
            return null;
        }
        actuators.push(parsed);
    }
    return {
        serial,
        name,
        prefix,
        productType,
        online: asBoolean(raw.online, false),
        sensor,
        actuators,
    };
}

export function parseIngestBody(raw: unknown): ParseResult {
    if (!isRecord(raw)) {
        return {ok: false, error: "body must be an object"};
    }
    for (const key of Object.keys(raw)) {
        if (SECRET_KEYS.has(key)) {
            return {ok: false, error: "forbidden key"};
        }
    }
    if (raw.pluginId !== GGS_PLUGIN_ID || raw.source !== "ggs-cloud") {
        return {ok: false, error: "pluginId/source mismatch"};
    }
    const updatedAt = asString(raw.updatedAt, "");
    const ts = Date.parse(updatedAt);
    if (!Number.isFinite(ts)) {
        return {ok: false, error: "updatedAt"};
    }
    if (ts - Date.now() > GGS_FUTURE_SKEW_MS) {
        return {ok: false, error: "updatedAt in the future"};
    }
    if (!Array.isArray(raw.devices) || raw.devices.length > GGS_MAX_DEVICES) {
        return {ok: false, error: "devices"};
    }
    const devices: GgsDeviceSnapshot[] = [];
    for (const item of raw.devices) {
        const parsed = parseDevice(item);
        if (!parsed) {
            return {ok: false, error: "device"};
        }
        devices.push(parsed);
    }
    return {
        ok: true,
        value: {
            pluginId: GGS_PLUGIN_ID,
            source: "ggs-cloud",
            updatedAt: new Date(ts).toISOString(),
            online: asBoolean(raw.online, false),
            devices,
        },
    };
}

export function withStale(state: GgsLiveIngest, nowMs: number = Date.now()): GgsLivePublic {
    const ts = Date.parse(state.updatedAt);
    const stale = !Number.isFinite(ts) || nowMs - ts >= GGS_STALE_AFTER_MS;
    return {
        ...state,
        stale,
        online: stale ? false : state.online,
        updatedAt: state.updatedAt,
    };
}

export function fingerprint(state: Pick<GgsLiveIngest, "online" | "devices">): string {
    return JSON.stringify({online: state.online, devices: state.devices});
}
