import {readFile} from "node:fs/promises";
import {asString, isRecord} from "@/lib/coerce";
import {atomicWriteFile} from "@/lib/atomic-file";
import type {GgsActuatorKind, GgsLiveIngest} from "@/lib/ggs-live";
import {actuatorLabel} from "@/lib/live-climate-view";
import {actuatorKey, catalogWatts, type EnergyOverride} from "@/lib/energy/catalog";
import {logEnergy} from "@/lib/energy/log";
import {energySettingsFile} from "@/lib/energy/paths";

export type EnergySettings = {
    publicTariffEurPerKwh: number | null;
    privateTariffEurPerKwh: number | null;
    overrides: EnergyOverride[];
};

export const EMPTY_ENERGY_SETTINGS: EnergySettings = {
    publicTariffEurPerKwh: null,
    privateTariffEurPerKwh: null,
    overrides: [],
};

let loggedInvalidSettings = false;

export function _resetEnergySettingsLogForTests(): void {
    loggedInvalidSettings = false;
}

function logInvalidSettings(): void {
    if (loggedInvalidSettings) {
        return;
    }
    loggedInvalidSettings = true;
    logEnergy("invalid_energy_settings");
}

function parseTariff(value: unknown): number | null {
    if (value === null || value === undefined || value === "") {
        return null;
    }
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return null;
    }
    return parsed;
}

function parseOverride(raw: unknown): EnergyOverride | null {
    if (!isRecord(raw)) {
        return null;
    }
    const key = asString(raw.key, "").trim();
    if (!key || !key.includes(":")) {
        return null;
    }
    const override: EnergyOverride = {key};
    if (raw.watts !== undefined && raw.watts !== null && raw.watts !== "") {
        const watts = typeof raw.watts === "number" ? raw.watts : Number(raw.watts);
        if (!Number.isFinite(watts) || watts < 0) {
            return null;
        }
        override.watts = watts;
    }
    if (isRecord(raw.wattsByLevel)) {
        const wattsByLevel: Record<string, number> = {};
        for (const [level, watts] of Object.entries(raw.wattsByLevel)) {
            const parsed = typeof watts === "number" ? watts : Number(watts);
            if (Number.isFinite(parsed) && parsed >= 0) {
                wattsByLevel[level] = parsed;
            }
        }
        if (Object.keys(wattsByLevel).length > 0) {
            override.wattsByLevel = wattsByLevel;
        }
    }
    if (override.watts === undefined && override.wattsByLevel === undefined) {
        return null;
    }
    return override;
}

export function parseEnergySettings(raw: unknown): EnergySettings | null {
    if (!isRecord(raw)) {
        return null;
    }
    const overrides: EnergyOverride[] = [];
    if (raw.overrides !== undefined && !Array.isArray(raw.overrides)) {
        return null;
    }
    if (Array.isArray(raw.overrides)) {
        for (const item of raw.overrides) {
            const parsed = parseOverride(item);
            if (parsed) {
                overrides.push(parsed);
            }
        }
    }
    const publicTariff = parseTariff(raw.publicTariffEurPerKwh);
    const privateTariff = parseTariff(raw.privateTariffEurPerKwh);
    if (
        raw.publicTariffEurPerKwh != null &&
        raw.publicTariffEurPerKwh !== "" &&
        publicTariff === null
    ) {
        return null;
    }
    if (
        raw.privateTariffEurPerKwh != null &&
        raw.privateTariffEurPerKwh !== "" &&
        privateTariff === null
    ) {
        return null;
    }
    return {
        publicTariffEurPerKwh: publicTariff,
        privateTariffEurPerKwh: privateTariff,
        overrides,
    };
}

export async function readEnergySettings(): Promise<EnergySettings> {
    try {
        const raw = JSON.parse(await readFile(energySettingsFile(), "utf8")) as unknown;
        const parsed = parseEnergySettings(raw);
        if (!parsed) {
            logInvalidSettings();
            return EMPTY_ENERGY_SETTINGS;
        }
        return parsed;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return EMPTY_ENERGY_SETTINGS;
        }
        logInvalidSettings();
        return EMPTY_ENERGY_SETTINGS;
    }
}

export async function writeEnergySettings(settings: EnergySettings): Promise<void> {
    const body: Record<string, unknown> = {
        overrides: settings.overrides,
    };
    if (settings.publicTariffEurPerKwh !== null) {
        body.publicTariffEurPerKwh = settings.publicTariffEurPerKwh;
    }
    if (settings.privateTariffEurPerKwh !== null) {
        body.privateTariffEurPerKwh = settings.privateTariffEurPerKwh;
    }
    await atomicWriteFile(energySettingsFile(), JSON.stringify(body, null, 2));
}

export type EnergySettingsFormResult =
    | {ok: true; settings: EnergySettings | undefined}
    | {ok: false; error: "invalid_energy"};

function parseFormTariff(raw: string): {ok: true; value: number | null} | {ok: false} {
    const text = raw.trim();
    if (text.length === 0) {
        return {ok: true, value: null};
    }
    const parsed = Number(text);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return {ok: false};
    }
    return {ok: true, value: parsed};
}

function parseFormWatts(raw: string): {ok: true; value: number | undefined} | {ok: false} {
    const text = raw.trim();
    if (text.length === 0) {
        return {ok: true, value: undefined};
    }
    const parsed = Number(text);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return {ok: false};
    }
    return {ok: true, value: parsed};
}

export function parseEnergySettingsForm(
    formData: FormData,
    previous: EnergySettings = EMPTY_ENERGY_SETTINGS,
): EnergySettingsFormResult {
    if (!formData.has("energyPublicTariff")) {
        return {ok: true, settings: undefined};
    }

    const publicTariff = parseFormTariff(String(formData.get("energyPublicTariff") ?? ""));
    const privateTariff = parseFormTariff(String(formData.get("energyPrivateTariff") ?? ""));
    if (!publicTariff.ok || !privateTariff.ok) {
        return {ok: false, error: "invalid_energy"};
    }

    const keys = formData.getAll("energyOverrideKey").map((value) => String(value));
    const wattsList = formData.getAll("energyOverrideWatts").map((value) => String(value));
    const previousByKey = new Map(previous.overrides.map((item) => [item.key, item]));
    const seen = new Set<string>();
    const overrides: EnergyOverride[] = [];

    for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i]?.trim() ?? "";
        if (!key) {
            continue;
        }
        seen.add(key);
        const parsedWatts = parseFormWatts(wattsList[i] ?? "");
        if (!parsedWatts.ok) {
            return {ok: false, error: "invalid_energy"};
        }
        const previousOverride = previousByKey.get(key);
        const next: EnergyOverride = {key};
        if (parsedWatts.value !== undefined) {
            next.watts = parsedWatts.value;
        }
        if (previousOverride?.wattsByLevel) {
            next.wattsByLevel = previousOverride.wattsByLevel;
        }
        if (next.watts === undefined && next.wattsByLevel === undefined) {
            continue;
        }
        overrides.push(next);
    }

    for (const previousOverride of previous.overrides) {
        if (!seen.has(previousOverride.key)) {
            overrides.push(previousOverride);
        }
    }

    return {
        ok: true,
        settings: {
            publicTariffEurPerKwh: publicTariff.value,
            privateTariffEurPerKwh: privateTariff.value,
            overrides,
        },
    };
}

export type EnergyActuatorRow = {
    key: string;
    label: string;
    kind: GgsActuatorKind;
    hint: string;
    watts: string;
};

function formatHintWatts(watts: number): string {
    if (Number.isInteger(watts) || Math.abs(watts - Math.round(watts)) < 1e-6) {
        return String(Math.round(watts));
    }
    return watts.toFixed(1);
}

export function energyActuatorRows(
    live: GgsLiveIngest | null,
    settings: EnergySettings,
): EnergyActuatorRow[] {
    if (!live) {
        return [];
    }
    const overrideByKey = new Map(settings.overrides.map((item) => [item.key, item]));
    const rows: EnergyActuatorRow[] = [];
    for (const device of live.devices) {
        for (const actuator of device.actuators) {
            const key = actuatorKey(device.serial, actuator.id);
            const override = overrideByKey.get(key);
            const level = actuator.level;
            const displayLabel = `${device.name} · ${actuatorLabel(actuator)}`;
            let hint = "catalog (when on)";
            if (actuator.kind === "outlet") {
                hint = "catalog 0 W — set watts when on";
            } else if (level !== null) {
                const catalog = catalogWatts(actuator.kind, actuator.id, String(level), true);
                hint = `catalog ${formatHintWatts(catalog)} W`;
            }
            rows.push({
                key,
                label: displayLabel,
                kind: actuator.kind,
                hint,
                watts: override?.watts !== undefined ? String(override.watts) : "",
            });
        }
    }
    return rows;
}

export function viewerTariff(
    settings: EnergySettings,
    kind: "public" | "private",
): number | null {
    return kind === "private" ? settings.privateTariffEurPerKwh : settings.publicTariffEurPerKwh;
}
