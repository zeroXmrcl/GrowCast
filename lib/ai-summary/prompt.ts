import type {StageContext, ClimateWindowStats} from "@/lib/ai-summary/types";

export const AI_SUMMARY_SYSTEM_PROMPT = [
    "You are a horticultural climate analyst for an indoor grow.",
    "Judge the measured climate yourself from the plant stage (veg, flower week, and so on).",
    "Return one min and max per metric. That single band is compared with every sample in the 24 hour window.",
    "Include a healthy night in the same band. There is no separate night range.",
    "Judge PPFD for the light period only. Lights-off samples are ignored.",
    "You are NOT given the grower's target values — ignore any guessed user targets.",
    "Discuss only the plant and climate. No devices, serial numbers, cameras,",
    "filenames, locations, people, or that a photo was uploaded.",
    "If an image is present, describe only visible plant health (color, turgor, stress, flowers).",
    "Write headline, summary, plantObservation, recommendations, and notes in English.",
    "Keep rating short in English (e.g. excellent, good, fair, poor, critical).",
    "score and confidence 0–100. At most three concrete recommendations.",
    "Still send pctInRange and verdict. The server replaces both from the measured samples.",
].join(" ");

export function buildAiSummaryUserPrompt(input: {
    stage: StageContext;
    stats: ClimateWindowStats;
    imageUsed: boolean;
}): string {
    const unknown = "unknown";
    const stageLines = [
        `Stage (free text): ${input.stage.stageLabel || unknown}`,
        `Derived phase: ${input.stage.phase}`,
        `Days since seeding: ${input.stage.daysSinceSeeding ?? unknown}`,
        `Flower week (only if named in the stage text): ${input.stage.flowerWeek ?? "not given"}`,
        `Light schedule (free text): ${input.stage.lightSchedule || unknown}`,
        `Plant: ${input.stage.plant || unknown}`,
        `Strain: ${input.stage.strain || unknown}`,
    ];
    return [
        "Stage context (no climate targets):",
        stageLines.join("\n"),
        "",
        "Measured stats for the last 24 hours, split into day and night. Day/night comes from sensor isDay, not from targets.",
        "Use that split to see the night drop. The range you return is still one band for both.",
        JSON.stringify(input.stats),
        "",
        input.imageUsed
            ? "A current plant photo is attached. Assess only the plant."
            : "No plant photo is available.",
        "",
        "Reply with the required JSON only.",
    ].join("\n");
}

export function promptContainsForbiddenTargets(text: string): boolean {
    return /temperatureDay|temperatureNight|humidityDay|humidityNight|climate\.temperature|climate\.humidity/.test(
        text,
    );
}
