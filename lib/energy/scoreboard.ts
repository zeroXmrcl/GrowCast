import {withStale, type GgsDeviceSnapshot, type GgsLiveIngest} from "@/lib/ggs-live";
import {getArchivedGrow} from "@/lib/archives";
import {getCurrentGrow} from "@/lib/db";
import {readGgsLive} from "@/lib/ggs-live-store";
import {actuatorLabel} from "@/lib/live-climate-view";
import {accrueEnergyPending} from "@/lib/energy/accrue";
import {actuatorKey, kindFromActuatorId, lookupWatts} from "@/lib/energy/catalog";
import {berlinDateOnly, berlinDateWindow} from "@/lib/energy/berlin";
import {logEnergy} from "@/lib/energy/log";
import {costEur, round1, round2, totalsForDays} from "@/lib/energy/math";
import {readArchiveEnergy} from "@/lib/energy/archive";
import {buildEnergySeries} from "@/lib/energy/series";
import {readAllCurrentDays, readEnergyCursor} from "@/lib/energy/store";
import {readEnergySettings, viewerTariff} from "@/lib/energy/settings";
import type {
    EnergyActuatorRef,
    EnergyDayFile,
    EnergyDeviceRow,
    EnergyPublicDto,
    EnergyWindow,
} from "@/lib/energy/types";

function collectRefs(deviceLists: Array<GgsDeviceSnapshot[] | undefined>): Map<string, EnergyActuatorRef> {
    const refs = new Map<string, EnergyActuatorRef>();
    for (const devices of deviceLists) {
        if (!devices) {
            continue;
        }
        for (const device of devices) {
            for (const actuator of device.actuators) {
                const key = actuatorKey(device.serial, actuator.id);
                refs.set(key, {
                    key,
                    serial: device.serial,
                    name: device.name,
                    id: actuator.id,
                    label: actuator.label,
                    kind: actuator.kind,
                });
            }
        }
    }
    return refs;
}

function publicNameLabel(refs: Map<string, EnergyActuatorRef>, key: string): {name: string; label: string} {
    const ref = refs.get(key);
    if (ref) {
        return {name: ref.name, label: actuatorLabel(ref)};
    }
    const sep = key.lastIndexOf(":");
    const id = sep === -1 ? key : key.slice(sep + 1);
    const kind = kindFromActuatorId(id);
    if (kind) {
        return {name: "Device", label: actuatorLabel({id, kind, label: id})};
    }
    return {name: "Device", label: id};
}

export function nowWattsFromSnapshot(
    live: GgsLiveIngest | null,
    overrides: Parameters<typeof lookupWatts>[0]["overrides"],
): number | null {
    if (!live) {
        return null;
    }
    let watts = 0;
    for (const device of live.devices) {
        for (const actuator of device.actuators) {
            if (!actuator.on || actuator.level === null) {
                continue;
            }
            watts += lookupWatts({
                key: actuatorKey(device.serial, actuator.id),
                kind: actuator.kind,
                id: actuator.id,
                level: String(actuator.level),
                on: true,
                overrides,
            });
        }
    }
    return watts;
}

function toWindow(kWh: number, tariff: number | null): EnergyWindow {
    const cost = costEur(kWh, tariff);
    return {
        kWh: round1(kWh),
        costEur: cost === null ? null : round2(cost),
    };
}

function deviceRows(
    growKwh: number,
    tariff: number | null,
    refs: Map<string, EnergyActuatorRef>,
    deviceTotals: Map<string, {key: string; seconds: number; kWh: number}>,
): EnergyDeviceRow[] {
    const rows: EnergyDeviceRow[] = [];
    for (const totals of deviceTotals.values()) {
        const {name, label} = publicNameLabel(refs, totals.key);
        const cost = costEur(totals.kWh, tariff);
        rows.push({
            name,
            label,
            hoursOn: round1(totals.seconds / 3600),
            kWh: round1(totals.kWh),
            costEur: cost === null ? null : round2(cost),
            sharePct: growKwh > 0 ? Math.round((totals.kWh / growKwh) * 100) : 0,
        });
    }
    rows.sort((a, b) => b.kWh - a.kWh || a.name.localeCompare(b.name) || a.label.localeCompare(b.label));
    return rows;
}

export async function buildEnergyDto(options: {
    grow: string;
    tariffKind: "public" | "private";
    nowMs?: number;
}): Promise<{ok: true; dto: EnergyPublicDto} | {ok: false; error: "not_found"}> {
    const nowMs = options.nowMs ?? Date.now();
    const settings = await readEnergySettings();
    const tariff = viewerTariff(settings, options.tariffKind);
    const isCurrent = options.grow === "current" || options.grow === "";

    if (!isCurrent) {
        const archive = await getArchivedGrow(options.grow);
        if (!archive) {
            return {ok: false, error: "not_found"};
        }
        const energy = await readArchiveEnergy(options.grow);
        const days = new Map<string, EnergyDayFile>();
        if (energy) {
            for (const [date, value] of Object.entries(energy.days)) {
                days.set(date, {date, hours: value.hours});
            }
        }
        const live = await readGgsLive();
        const refs = collectRefs([energy?.devices, live?.devices]);
        const growTotals = totalsForDays(days.values(), null, refs, settings.overrides);
        const growCost = costEur(growTotals.kWh, tariff);
        const dto: EnergyPublicDto = {
            grow: options.grow,
            estimated: true,
            tariffKind: options.tariffKind,
            appliedTariffEurPerKwh: tariff,
            startedAt: energy?.startedAt || null,
            empty: energy == null,
            nowWatts: null,
            nowWattsStale: null,
            windows: null,
            kWh: round1(growTotals.kWh),
            costEur: growCost === null ? null : round2(growCost),
            devices: deviceRows(growTotals.kWh, tariff, refs, growTotals.devices),
        };
        return {ok: true, dto};
    }

    try {
        await accrueEnergyPending(nowMs, {persist: false});
    } catch {
        logEnergy("energy_accrue_failed");
    }

    const [live, cursor, days, grow] = await Promise.all([
        readGgsLive(),
        readEnergyCursor(),
        readAllCurrentDays(),
        getCurrentGrow(),
    ]);
    const cursorMatches = cursor?.growId === grow.id;
    const activeCursor = cursorMatches ? cursor : null;
    const activeDays = cursorMatches ? days : new Map<string, EnergyDayFile>();
    const refs = collectRefs([live?.devices, activeCursor?.devices]);
    const today = berlinDateOnly(nowMs);
    const growTotals = totalsForDays(activeDays.values(), null, refs, settings.overrides);
    const todayTotals = totalsForDays(
        [...activeDays.values()].filter((day) => day.date === today),
        new Set([today]),
        refs,
        settings.overrides,
    );
    const d7 = new Set(berlinDateWindow(today, 7));
    const d30 = new Set(berlinDateWindow(today, 30));
    const d7Totals = totalsForDays(
        [...activeDays.values()].filter((day) => d7.has(day.date)),
        d7,
        refs,
        settings.overrides,
    );
    const d30Totals = totalsForDays(
        [...activeDays.values()].filter((day) => d30.has(day.date)),
        d30,
        refs,
        settings.overrides,
    );

    const nowWatts = nowWattsFromSnapshot(live, settings.overrides);
    const publicLive = live ? withStale(live, nowMs) : null;
    const hasBuckets = growTotals.seconds > 0 || activeDays.size > 0;
    const empty = !live && !hasBuckets && !activeCursor;

    const growCost = costEur(growTotals.kWh, tariff);

    const dto: EnergyPublicDto = {
        grow: "current",
        estimated: true,
        tariffKind: options.tariffKind,
        appliedTariffEurPerKwh: tariff,
        startedAt: activeCursor?.startedAt ?? null,
        empty,
        nowWatts: nowWatts === null ? null : Math.round(nowWatts),
        nowWattsStale: publicLive ? publicLive.stale : nowWatts === null ? null : true,
        windows: {
            today: toWindow(todayTotals.kWh, tariff),
            "7d": toWindow(d7Totals.kWh, tariff),
            "30d": toWindow(d30Totals.kWh, tariff),
            grow: toWindow(growTotals.kWh, tariff),
        },
        series: buildEnergySeries({
            days: activeDays,
            refs,
            overrides: settings.overrides,
            startedAt: activeCursor?.startedAt ?? null,
            nowMs,
        }),
        kWh: round1(growTotals.kWh),
        costEur: growCost === null ? null : round2(growCost),
        devices: deviceRows(growTotals.kWh, tariff, refs, growTotals.devices),
    };
    return {ok: true, dto};
}
