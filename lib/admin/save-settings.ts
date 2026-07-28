import {getCurrentGrow, updateCurrentGrow, type GrowRecord, type GrowUpdateInput} from "@/lib/db";
import {
    getTimelapseSettings,
    saveTimelapseSettings,
    type TimelapseSettings,
} from "@/lib/timelapse-settings";

export type SaveAdminSettingsInput = {
    grow: GrowUpdateInput;
    timelapse: TimelapseSettings;
};

export type SaveAdminSettingsResult =
    | {ok: true; grow: GrowRecord; timelapse: TimelapseSettings}
    | {ok: false; error: string};

/**
 * Persist grow + timelapse with best-effort atomicity for a two-file store:
 * snapshot previous values, write grow then timelapse; on timelapse failure
 * restore previous grow so the pair is not left half-applied successfully.
 */
export async function saveAdminSettings(
    input: SaveAdminSettingsInput,
): Promise<SaveAdminSettingsResult> {
    const previousGrow = await getCurrentGrow();
    const previousTimelapse = await getTimelapseSettings();

    let nextGrow: GrowRecord;
    try {
        nextGrow = await updateCurrentGrow(input.grow);
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }

    try {
        const nextTimelapseRecord = await saveTimelapseSettings(input.timelapse);
        return {
            ok: true,
            grow: nextGrow,
            timelapse: nextTimelapseRecord.settings,
        };
    } catch (error) {
        try {
            await updateCurrentGrow({
                name: previousGrow.name,
                showGrowName: previousGrow.showGrowName,
                plant: previousGrow.plant,
                plantAmount: previousGrow.plantAmount,
                streamUrl: previousGrow.streamUrl,
                details: previousGrow.details,
                growSetup: previousGrow.growSetup,
                status: previousGrow.status,
                socials: previousGrow.socials,
                climate: previousGrow.climate,
            });
            await saveTimelapseSettings(previousTimelapse);
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
}
