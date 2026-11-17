import type {EnergyPublicDto} from "@/plugins/ggs/host/energy/types";
import {shouldShowLiveRow} from "@/plugins/ggs/host/live-climate-view";
import type {GgsLivePublic} from "@/plugins/ggs/host/ggs-live";

export function overlayClimateGearVisible(
    snapshot: GgsLivePublic | null | undefined,
): boolean {
    return shouldShowLiveRow(snapshot);
}

export function overlayEnergyVisible(
    dto: EnergyPublicDto | null | undefined,
): boolean {
    return dto != null && dto.empty !== true;
}

export function applyOverlayEnergyPoll(
    current: EnergyPublicDto | null,
    next: EnergyPublicDto | null,
): EnergyPublicDto | null {
    if (next === null) {
        return current;
    }
    if (next.empty) {
        return null;
    }
    return next;
}
