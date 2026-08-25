import {getCurrentGrow, replaceCurrentGrow, updateCurrentGrow, type GrowRecord, type GrowUpdateInput} from "@/lib/db";
import {withGrowWriteLock} from "@/lib/grow-write-lock";
import {
    getTimelapseSettings,
    saveTimelapseSettings,
    type TimelapseSettings,
} from "@/lib/timelapse-settings";
import {readEnergySettings, writeEnergySettings, type EnergySettings} from "@/lib/energy/settings";

export type SaveAdminSettingsInput = {
    grow: GrowUpdateInput;
    timelapse: TimelapseSettings;
    expectedGrowId?: string;
    energy?: EnergySettings;
};

export type SaveAdminSettingsResult =
    | {ok: true; grow: GrowRecord; timelapse: TimelapseSettings}
    | {ok: false; error: string};

/** Rollback exists because grow, timelapse, and energy are separate files. */
export async function saveAdminSettings(
    input: SaveAdminSettingsInput,
): Promise<SaveAdminSettingsResult> {
    return withGrowWriteLock(async () => {
        const previousGrow = await getCurrentGrow();
        if (!input.expectedGrowId || input.expectedGrowId !== previousGrow.id) {
            return {ok: false, error: "stale_grow"};
        }
        let previousTimelapse;
        try {
            previousTimelapse = await getTimelapseSettings();
        } catch (error) {
            return {
                ok: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
        const previousEnergy = input.energy !== undefined ? await readEnergySettings() : null;

        let nextGrow: GrowRecord;
        try {
            nextGrow = await updateCurrentGrow(input.grow, input.expectedGrowId);
        } catch (error) {
            return {
                ok: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }

        try {
            const nextTimelapseRecord = await saveTimelapseSettings(input.timelapse);
            if (input.energy !== undefined) {
                await writeEnergySettings(input.energy);
            }
            return {
                ok: true,
                grow: nextGrow,
                timelapse: nextTimelapseRecord.settings,
            };
        } catch (error) {
            try {
                const live = await getCurrentGrow();
                if (live.id === previousGrow.id) {
                    await replaceCurrentGrow(previousGrow);
                }
                await saveTimelapseSettings(previousTimelapse);
                if (previousEnergy) {
                    await writeEnergySettings(previousEnergy);
                }
            } catch (rollbackError) {
                return {
                    ok: false,
                    error: `Save failed and rollback incomplete: ${
                        error instanceof Error ? error.message : String(error)
                    }; rollback: ${
                        rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
                    }`,
                };
            }

            return {
                ok: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    });
}
