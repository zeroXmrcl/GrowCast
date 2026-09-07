import {chmod, readFile} from "node:fs/promises";
import {asBoolean, isRecord} from "@/lib/coerce";
import {atomicWriteFile} from "@/lib/atomic-file";
import type {OverlayAlertKind} from "@/lib/overlay-alert";
import {parseOverlayScalePct} from "@/lib/overlay-scale";
import {restreamAlertsFile, restreamDir} from "@/lib/restream/paths";

export type AlertsSettings = {
    follow: boolean;
    sub: boolean;
    raid: boolean;
    bits: boolean;
    stingEnabled: boolean;
    alertScalePct: number;
};

export const EMPTY_ALERTS_SETTINGS: AlertsSettings = {
    follow: true,
    sub: true,
    raid: true,
    bits: true,
    stingEnabled: true,
    alertScalePct: 100,
};

export function parseAlertsSettings(raw: unknown): AlertsSettings {
    if (!isRecord(raw)) {
        return EMPTY_ALERTS_SETTINGS;
    }
    return {
        follow: asBoolean(raw.follow, true),
        sub: asBoolean(raw.sub, true),
        raid: asBoolean(raw.raid, true),
        bits: asBoolean(raw.bits, true),
        stingEnabled: asBoolean(raw.stingEnabled, true),
        alertScalePct: parseOverlayScalePct(raw.alertScalePct),
    };
}

export function shouldEnqueueKind(settings: AlertsSettings, kind: OverlayAlertKind): boolean {
    if (kind === "manual") {
        return true;
    }
    return settings[kind];
}

export async function readAlertsSettings(): Promise<AlertsSettings> {
    try {
        return parseAlertsSettings(JSON.parse(await readFile(restreamAlertsFile(), "utf8")));
    } catch {
        return EMPTY_ALERTS_SETTINGS;
    }
}

export async function writeAlertsSettings(settings: AlertsSettings): Promise<void> {
    const parsed = parseAlertsSettings(settings);
    await atomicWriteFile(restreamAlertsFile(), `${JSON.stringify(parsed, null, 2)}\n`);
    await chmod(restreamDir(), 0o700).catch(() => undefined);
    await chmod(restreamAlertsFile(), 0o600);
}
