import {isDateOnly} from "@/lib/date-only";
import type {GrowRecord} from "@/lib/db";
import {getDaysSince} from "@/utils/daysSinceSeeding";
import type {GrowPhase, StageContext} from "@/lib/ai-summary/types";

const PLACEHOLDER_SEEDED = "2001-01-01";

export function isUsableSeededAt(value: string): boolean {
    return isDateOnly(value) && value !== PLACEHOLDER_SEEDED;
}

export function growAgeDays(seededAt: string): number | null {
    if (!isUsableSeededAt(seededAt)) {
        return null;
    }
    return getDaysSince(seededAt);
}

/**
 * Reads flower week from grower-entered stage text.
 * English: flower / flowering / bloom + optional week N.
 * German tokens stay because operators type them into the stage field
 * (user input, not UI copy): Blüte / Bluete, Woche / W3.
 */
function parseFlowerWeek(stage: string): number | null {
    const match =
        /(?:blüte|bluete|flower(?:ing)?|bloom)\s*(?:w(?:oche)?|week)?\s*(\d{1,2})\b/i.exec(stage)
        ?? /(?:w(?:oche)?|week)\s*(\d{1,2})\b/i.exec(stage);
    if (!match) {
        return null;
    }
    const week = Number(match[1]);
    if (!Number.isInteger(week) || week < 1 || week > 20) {
        return null;
    }
    return week;
}

/**
 * Maps free-text stage labels to a coarse phase.
 * English: harvest, dry, cure, late flower, ripen, flower, bloom, seedling,
 * clone, seed, veg, vegetation, grow.
 * German grower labels stay in the regexes so existing tents still parse
 * (user input, not UI copy): Ernte, Trockn*, spätblüte, Blüte/Bluete,
 * Sämling/Saemling, Steckling, Keim, Samen, Wachstum.
 */
export function deriveGrowPhase(stage: string): GrowPhase {
    const text = stage.trim().toLowerCase();
    if (!text) {
        return "unknown";
    }
    if (/(ernte|harvest|dry|trockn|cure)/.test(text)) {
        return "harvest";
    }
    if (/(spätblüte|late\s*flower|ripen)/.test(text)) {
        return "late_flower";
    }
    if (/(blüte|bluete|flower|bloom)/.test(text)) {
        const week = parseFlowerWeek(stage);
        if (week !== null && week >= 6) {
            return "late_flower";
        }
        return "flower";
    }
    if (/(sämling|saemling|seedling|steckling|clone|keim)/.test(text)) {
        return "seedling";
    }
    if (/(^|\b)(seed|samen)(\b|$)/.test(text)) {
        return "seed";
    }
    if (/(veg|vegetation|wachstum|grow)/.test(text)) {
        return "veg";
    }
    return "unknown";
}

export function stageContextFromGrow(grow: Pick<GrowRecord, "plant" | "details">): StageContext {
    const stageLabel = grow.details.stage.trim();
    const seededAt = grow.details.seededAt;
    const daysSinceSeeding = isUsableSeededAt(seededAt) ? getDaysSince(seededAt) : null;
    const phase = deriveGrowPhase(stageLabel);
    return {
        stageLabel,
        phase,
        daysSinceSeeding,
        flowerWeek: phase === "flower" || phase === "late_flower" ? parseFlowerWeek(stageLabel) : null,
        lightSchedule: grow.details.lightSchedule.trim(),
        plant: grow.plant.trim(),
        strain: grow.details.strain.trim(),
    };
}
