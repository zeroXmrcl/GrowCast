import type {EnergyPublicDto, EnergyWindow} from "@/lib/energy/types";

export function overlayEnergyGrowWindow(dto: EnergyPublicDto): EnergyWindow | null {
    return dto.windows?.grow ?? null;
}
