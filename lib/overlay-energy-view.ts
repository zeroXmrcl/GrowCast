import type {EnergyPublicDto, EnergyWindow} from "@/plugins/ggs/host/energy/types";

export function overlayEnergyGrowWindow(dto: EnergyPublicDto): EnergyWindow | null {
    return dto.windows?.grow ?? null;
}
