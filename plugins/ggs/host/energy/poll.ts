import {isRecord} from "@/lib/coerce";
import type {EnergyPublicDto} from "@/plugins/ggs/host/energy/types";

/** Live snapshots land about every 15s. Faster polls repeat the same watts. */
export const ENERGY_POLL_MS = 15_000;
export const ENERGY_PUBLIC_POLL_PATH = "/api/data/plugins/ggs/energy?grow=current&tariff=public";
export const ENERGY_POLL_PATH = ENERGY_PUBLIC_POLL_PATH;
export const ENERGY_ADMIN_POLL_PATH = "/api/plugins/v1/growcast.ggs/x/energy?grow=current";

let energyPollInFlight = false;
let energyDtoCache: EnergyPublicDto | null = null;
let energyDtoPending: Promise<EnergyPublicDto | null> | null = null;

export function peekEnergyDto(): EnergyPublicDto | null {
    return energyDtoCache;
}

export function energyDtoInFlight(): Promise<EnergyPublicDto | null> | null {
    return energyDtoPending;
}

export function parseEnergyPollBody(raw: unknown): EnergyPublicDto | null {
    if (!isRecord(raw) || raw.estimated !== true) {
        return null;
    }
    if (typeof raw.grow !== "string") {
        return null;
    }
    if (raw.tariffKind !== "public" && raw.tariffKind !== "private") {
        return null;
    }
    if (typeof raw.empty !== "boolean") {
        return null;
    }
    if (typeof raw.kWh !== "number" || !Number.isFinite(raw.kWh)) {
        return null;
    }
    if (!Array.isArray(raw.devices)) {
        return null;
    }
    return raw as EnergyPublicDto;
}

export async function fetchEnergyDto(
    fetcher: typeof fetch = fetch,
    path: string = ENERGY_PUBLIC_POLL_PATH,
): Promise<EnergyPublicDto | null> {
    if (energyPollInFlight) {
        return null;
    }
    energyPollInFlight = true;
    const pending = (async () => {
        try {
            const response = await fetcher(path, {
                credentials: "same-origin",
                cache: "no-store",
            });
            if (!response.ok) {
                return null;
            }
            const parsed = parseEnergyPollBody(await response.json());
            if (parsed) {
                energyDtoCache = parsed;
            }
            return parsed;
        } catch {
            return null;
        } finally {
            energyPollInFlight = false;
            energyDtoPending = null;
        }
    })();
    energyDtoPending = pending;
    return pending;
}

export function shouldPollEnergy(visible: boolean): boolean {
    return visible;
}
