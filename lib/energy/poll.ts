import {isRecord} from "@/lib/coerce";
import type {EnergyPublicDto} from "@/lib/energy/types";

/** Live snapshots land about every 15s. Faster polls repeat the same watts. */
export const ENERGY_POLL_MS = 15_000;
export const ENERGY_POLL_PATH = "/api/data/energy?grow=current";

let energyPollInFlight = false;

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
): Promise<EnergyPublicDto | null> {
    if (energyPollInFlight) {
        return null;
    }
    energyPollInFlight = true;
    try {
        const response = await fetcher(ENERGY_POLL_PATH, {
            credentials: "same-origin",
            cache: "no-store",
        });
        if (!response.ok) {
            return null;
        }
        return parseEnergyPollBody(await response.json());
    } catch {
        return null;
    } finally {
        energyPollInFlight = false;
    }
}

export function shouldPollEnergy(visible: boolean): boolean {
    return visible;
}
