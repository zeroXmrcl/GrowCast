import {mkdir, readdir, readFile, rm, unlink} from "node:fs/promises";
import {asBoolean, asString, isRecord} from "@/lib/coerce";
import {atomicWriteFile} from "@/lib/atomic-file";
import type {GgsActuator, GgsActuatorKind, GgsDeviceSnapshot, GgsPrefix} from "@/lib/ggs-live";
import {logEnergy} from "@/lib/energy/log";
import {energyCurrentDir, energyCursorFile, energyDayFile} from "@/lib/energy/paths";
import type {EnergyCursor, EnergyDayFile, EnergyDayHours} from "@/lib/energy/types";

const DAY_FILE_NAME = /^(\d{4}-\d{2}-\d{2})\.json$/;
const KINDS = new Set<GgsActuatorKind>([
    "light",
    "fan",
    "blower",
    "humidifier",
    "dehumidifier",
    "heater",
    "outlet",
]);

function optionalFinite(value: unknown): number | null | undefined {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return undefined;
}

function parseCursorActuator(raw: unknown): GgsActuator | null {
    if (!isRecord(raw)) {
        return null;
    }
    const id = asString(raw.id, "").trim();
    const label = asString(raw.label, "").trim();
    const kind = asString(raw.kind, "").trim() as GgsActuatorKind;
    if (!id || !label || !KINDS.has(kind)) {
        return null;
    }
    const level = optionalFinite(raw.level ?? null);
    if (level === undefined) {
        return null;
    }
    return {id, label, kind, on: asBoolean(raw.on, false), level};
}

export function parseCursorDevices(raw: unknown): GgsDeviceSnapshot[] {
    if (!Array.isArray(raw)) {
        return [];
    }
    const devices: GgsDeviceSnapshot[] = [];
    for (const item of raw) {
        const parsed = parseCursorDevice(item);
        if (parsed) {
            devices.push(parsed);
        }
    }
    return devices;
}

function parseCursorDevice(raw: unknown): GgsDeviceSnapshot | null {
    if (!isRecord(raw)) {
        return null;
    }
    const serial = asString(raw.serial, "").replace(/:/g, "").toUpperCase();
    const name = asString(raw.name, "").trim();
    const prefix = asString(raw.prefix, "") as GgsPrefix;
    if (!serial || !name || (prefix !== "CB" && prefix !== "PS" && prefix !== "LC")) {
        return null;
    }
    if (!Array.isArray(raw.actuators)) {
        return null;
    }
    const actuators: GgsActuator[] = [];
    for (const item of raw.actuators) {
        const parsed = parseCursorActuator(item);
        if (parsed) {
            actuators.push(parsed);
        }
    }
    return {
        serial,
        name,
        prefix,
        productType: asString(raw.productType, "").trim() || "unknown",
        online: asBoolean(raw.online, false),
        sensor: {
            tempC: null,
            humidityPct: null,
            vpd: null,
            co2: null,
            ppfd: null,
            tempSoilC: null,
            humiditySoilPct: null,
            ecSoil: null,
        },
        actuators,
    };
}

function parseCursor(raw: unknown): EnergyCursor | null {
    if (!isRecord(raw)) {
        return null;
    }
    const growId = asString(raw.growId, "").trim();
    const startedAt = asString(raw.startedAt, "").trim();
    const lastAccruedAt = asString(raw.lastAccruedAt, "").trim();
    if (!growId || !startedAt || !lastAccruedAt) {
        return null;
    }
    if (!Number.isFinite(Date.parse(startedAt)) || !Number.isFinite(Date.parse(lastAccruedAt))) {
        return null;
    }
    return {
        growId,
        startedAt,
        lastAccruedAt,
        devices: parseCursorDevices(raw.devices),
    };
}

function parseLevelSeconds(raw: unknown): Record<string, number> {
    if (!isRecord(raw)) {
        return {};
    }
    const out: Record<string, number> = {};
    for (const [level, seconds] of Object.entries(raw)) {
        const value = typeof seconds === "number" && Number.isFinite(seconds) ? seconds : Number(seconds);
        if (Number.isFinite(value) && value > 0) {
            out[level] = value;
        }
    }
    return out;
}

function parseActuatorHours(raw: unknown): Record<string, Record<string, number>> {
    if (!isRecord(raw)) {
        return {};
    }
    const out: Record<string, Record<string, number>> = {};
    for (const [key, levels] of Object.entries(raw)) {
        const parsed = parseLevelSeconds(levels);
        if (Object.keys(parsed).length > 0) {
            out[key] = parsed;
        }
    }
    return out;
}

function parseDayHours(raw: unknown): EnergyDayHours {
    if (!isRecord(raw)) {
        return {};
    }
    const hours: EnergyDayHours = {};
    for (const [hourKey, actuators] of Object.entries(raw)) {
        const hour = Number(hourKey);
        if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
            continue;
        }
        const parsed = parseActuatorHours(actuators);
        if (Object.keys(parsed).length > 0) {
            hours[String(hour)] = parsed;
        }
    }
    return hours;
}

export function parseEnergyDayFile(raw: unknown, fallbackDate: string): EnergyDayFile | null {
    if (!isRecord(raw)) {
        return null;
    }
    const date = asString(raw.date, fallbackDate).trim() || fallbackDate;
    if (!DAY_FILE_NAME.test(`${date}.json`)) {
        return null;
    }
    return {date, hours: parseDayHours(raw.hours)};
}

export async function readEnergyCursor(): Promise<EnergyCursor | null> {
    try {
        const raw = JSON.parse(await readFile(energyCursorFile(), "utf8")) as unknown;
        const parsed = parseCursor(raw);
        if (!parsed) {
            logEnergy("corrupt_energy_cursor");
        }
        return parsed;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return null;
        }
        logEnergy("corrupt_energy_cursor");
        return null;
    }
}

let failNextCursorWrite = false;

export function _failNextEnergyCursorWriteForTests(): void {
    failNextCursorWrite = true;
}

export async function writeEnergyCursor(cursor: EnergyCursor): Promise<void> {
    if (failNextCursorWrite) {
        failNextCursorWrite = false;
        throw new Error("injected_cursor_write_failure");
    }
    await atomicWriteFile(energyCursorFile(), JSON.stringify(cursor, null, 2));
}

export async function energyCursorExists(): Promise<boolean> {
    try {
        await readFile(energyCursorFile());
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return false;
        }
        return true;
    }
}

export type EnergyDayInspect =
    | {status: "missing"}
    | {status: "corrupt"}
    | {status: "ok"; day: EnergyDayFile; raw: string};

export async function inspectEnergyDay(dateOnly: string): Promise<EnergyDayInspect> {
    try {
        const raw = await readFile(energyDayFile(dateOnly), "utf8");
        let parsedJson: unknown;
        try {
            parsedJson = JSON.parse(raw);
        } catch {
            return {status: "corrupt"};
        }
        const parsed = parseEnergyDayFile(parsedJson, dateOnly);
        if (!parsed) {
            return {status: "corrupt"};
        }
        return {status: "ok", day: parsed, raw};
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return {status: "missing"};
        }
        return {status: "corrupt"};
    }
}

export async function readEnergyDay(dateOnly: string): Promise<EnergyDayFile | null> {
    const inspected = await inspectEnergyDay(dateOnly);
    if (inspected.status === "ok") {
        return inspected.day;
    }
    if (inspected.status === "corrupt") {
        logEnergy("corrupt_energy_day");
    }
    return null;
}

export type EnergyDayWriteSnapshot = {
    date: string;
    previousRaw: string | null;
};

export async function restoreEnergyDayWrites(snapshots: EnergyDayWriteSnapshot[]): Promise<void> {
    for (const snapshot of snapshots) {
        const file = energyDayFile(snapshot.date);
        try {
            if (snapshot.previousRaw === null) {
                await unlink(file);
            } else {
                await atomicWriteFile(file, snapshot.previousRaw);
            }
        } catch (error) {
            if (snapshot.previousRaw === null && (error as NodeJS.ErrnoException).code === "ENOENT") {
                continue;
            }
            logEnergy("bucket_write_failed");
        }
    }
}

let failEnergyDayWriteOnCall = 0;
let energyDayWriteCalls = 0;

export function _failEnergyDayWriteOnCallForTests(callNumber: number): void {
    energyDayWriteCalls = 0;
    failEnergyDayWriteOnCall = callNumber;
}

export function _resetEnergyStoreForTests(): void {
    energyDayWriteCalls = 0;
    failEnergyDayWriteOnCall = 0;
    failNextCursorWrite = false;
}

export async function writeEnergyDay(day: EnergyDayFile): Promise<void> {
    energyDayWriteCalls += 1;
    if (failEnergyDayWriteOnCall > 0 && energyDayWriteCalls === failEnergyDayWriteOnCall) {
        failEnergyDayWriteOnCall = 0;
        throw new Error("injected_day_write_failure");
    }
    await atomicWriteFile(energyDayFile(day.date), JSON.stringify(day, null, 2));
}

export async function listCurrentEnergyDates(): Promise<string[]> {
    let entries;
    try {
        entries = await readdir(energyCurrentDir(), {withFileTypes: true});
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return [];
        }
        logEnergy("corrupt_energy_day");
        return [];
    }
    const dates: string[] = [];
    for (const entry of entries) {
        if (!entry.isFile()) {
            continue;
        }
        const match = DAY_FILE_NAME.exec(entry.name);
        if (match) {
            dates.push(match[1]);
        }
    }
    return dates.sort();
}

export async function readAllCurrentDays(): Promise<Map<string, EnergyDayFile>> {
    const dates = await listCurrentEnergyDates();
    const days = new Map<string, EnergyDayFile>();
    for (const date of dates) {
        const day = await readEnergyDay(date);
        if (day) {
            days.set(date, day);
        }
    }
    return days;
}

export function mergeDaySeconds(
    day: EnergyDayFile,
    hour: number,
    key: string,
    level: string,
    seconds: number,
): EnergyDayFile {
    const hourKey = String(hour);
    const hours = {...day.hours};
    const slot = {...(hours[hourKey] ?? {})};
    const levels = {...(slot[key] ?? {})};
    levels[level] = (levels[level] ?? 0) + seconds;
    slot[key] = levels;
    hours[hourKey] = slot;
    return {date: day.date, hours};
}

export async function resetEnergyCurrent(): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
            await rm(energyCurrentDir(), {recursive: true, force: true});
            await mkdir(energyCurrentDir(), {recursive: true});
            return;
        } catch (error) {
            lastError = error;
            await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
        }
    }
    throw lastError;
}
