import {getDaysSince} from "@/utils/daysSinceSeeding";

export type OverlayIdentityFields = {
    name: string;
    plant: string;
    seededAt: string;
    stage: string;
    lightSchedule: string;
    strain: string;
};

export type OverlayIdentityViewModel = {
    title: string;
    metaLine: string;
    strain: string;
};

function compact(value: string): string {
    return value.trim();
}

export function overlayIdentityView(fields: OverlayIdentityFields): OverlayIdentityViewModel {
    const name = compact(fields.name);
    const plant = compact(fields.plant);
    const title = name || plant || "Plant";
    const parts = [`Day ${getDaysSince(fields.seededAt)}`];
    const stage = compact(fields.stage);
    if (stage) {
        parts.push(stage);
    }
    const schedule = compact(fields.lightSchedule);
    if (schedule) {
        parts.push(schedule);
    }
    const strain = compact(fields.strain);
    const strainLine =
        strain && strain.toLowerCase() !== title.toLowerCase() ? strain : "";

    return {
        title,
        metaLine: parts.join(" · "),
        strain: strainLine,
    };
}
