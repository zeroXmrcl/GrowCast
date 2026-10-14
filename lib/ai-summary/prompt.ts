import type {StageContext, ClimateWindowStats} from "@/lib/ai-summary/types";

export const AI_SUMMARY_SYSTEM_PROMPT = [
    "Du bist eine hortikulturelle Klima-Analystin für einen Indoor-Grow.",
    "Beurteile das gemessene Klima selbst anhand des Pflanzenstadiums (Veg, Blütewoche usw.).",
    "Leite ideales Tag-/Nacht-Klima (Temp, RH, VPD, CO2, PPFD) selbst aus dem Stadium ab.",
    "Dir werden KEINE Zielwerte der Growerin übergeben — ignoriere vermutete Nutzerziele.",
    "Sprich ausschließlich über Pflanze und Klima. Keine Geräte, Seriennummern, Kameras,",
    "Dateinamen, Standorte, Personen oder dass ein Foto übertragen wurde.",
    "Wenn ein Bild da ist, beschreibe nur sichtbare Pflanzengesundheit (Farbe, Turgor, Stress, Blüte).",
    "headline, summary, plantObservation, recommendations und notes auf Deutsch.",
    "rating kurz auf Deutsch (z. B. sehr gut, gut, mittel, schwach, kritisch).",
    "score und confidence 0–100. Höchstens drei konkrete recommendations.",
    "pctInRange ist der Anteil der Messpunkte innerhalb DEINER abgeleiteten Spanne, oder null.",
].join(" ");

export function buildAiSummaryUserPrompt(input: {
    stage: StageContext;
    stats: ClimateWindowStats;
    imageUsed: boolean;
}): string {
    const stageLines = [
        `Stadium (Freitext): ${input.stage.stageLabel || "unbekannt"}`,
        `Abgeleitete Phase: ${input.stage.phase}`,
        `Tage seit Aussaat: ${input.stage.daysSinceSeeding ?? "unbekannt"}`,
        `Blütewoche (nur wenn im Stadiumstext genannt): ${input.stage.flowerWeek ?? "nicht angegeben"}`,
        `Lichtplan (Freitext): ${input.stage.lightSchedule || "unbekannt"}`,
        `Pflanze: ${input.stage.plant || "unbekannt"}`,
        `Sorte: ${input.stage.strain || "unbekannt"}`,
    ];
    return [
        "Kontext zum Stadium (keine Klima-Sollwerte):",
        stageLines.join("\n"),
        "",
        "Gemessene Statistik der letzten 24 Stunden. Tag/Nacht über Sensor-isDay, nicht über Sollwerte.",
        JSON.stringify(input.stats),
        "",
        input.imageUsed
            ? "Ein aktuelles Pflanzenfoto ist angehängt. Bewerte nur die Pflanze."
            : "Kein Pflanzenfoto vorhanden.",
        "",
        "Antworte ausschließlich mit dem geforderten JSON.",
    ].join("\n");
}

export function promptContainsForbiddenTargets(text: string): boolean {
    return /temperatureDay|temperatureNight|humidityDay|humidityNight|climate\.temperature|climate\.humidity/.test(
        text,
    );
}
