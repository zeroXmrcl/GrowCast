import {getCurrentGrow, updateCurrentGrow, type GrowRecord, type GrowUpdateInput} from "@/lib/db";
import {
    saveTimelapseSettings,
    type TimelapseSettings,
} from "@/lib/timelapse-settings";
import {writeEnergySettings, type EnergySettings} from "@/lib/energy/settings";

export type SaveAdminSettingsInput = {
    grow: GrowUpdateInput;
    expectedGrowId?: string;
};

export type SaveAdminSettingsResult =
    | {ok: true; grow: GrowRecord}
    | {ok: false; error: string};

export async function saveAdminSettings(
    input: SaveAdminSettingsInput,
): Promise<SaveAdminSettingsResult> {
    const previousGrow = await getCurrentGrow();
    if (!input.expectedGrowId || input.expectedGrowId !== previousGrow.id) {
        return {ok: false, error: "stale_grow"};
    }

    try {
        const nextGrow = await updateCurrentGrow(input.grow);
        return {ok: true, grow: nextGrow};
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

export async function saveTimelapseAdminSettings(
    timelapse: TimelapseSettings,
): Promise<{ok: true; timelapse: TimelapseSettings} | {ok: false; error: string}> {
    try {
        const record = await saveTimelapseSettings(timelapse);
        return {ok: true, timelapse: record.settings};
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

export async function saveEnergyAdminSettings(
    energy: EnergySettings,
): Promise<{ok: true} | {ok: false; error: string}> {
    try {
        await writeEnergySettings(energy);
        return {ok: true};
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
