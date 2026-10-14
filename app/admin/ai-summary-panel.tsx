import {AdminBand} from "@/app/admin/admin-band";
import {AdminImmediateForm} from "@/app/admin/admin-save-form";
import {AdminButton} from "@/components/admin/ui";
import type {AdminActionResult} from "@/lib/admin/action-result";
import type {AiSummaryPublic} from "@/lib/ai-summary/types";

type AiSummaryPanelProps = {
    configured: boolean;
    summary: AiSummaryPublic | null;
    regenerateAction: (formData: FormData) => Promise<AdminActionResult>;
};

export function AiSummaryPanel({configured, summary, regenerateAction}: AiSummaryPanelProps) {
    return (
        <AdminImmediateForm action={regenerateAction}>
            <AdminBand id="ai-summary" title="KI-Einschätzung">
                <div className="space-y-3 text-sm text-(--admin-text)">
                    <p className="text-(--admin-muted)">
                        Täglich gegen 08:00 Europe/Berlin. Die KI bekommt Stadium und Messwerte, nicht deine
                        Klima-Sollwerte. Das Timelapse-Foto geht nur an xAI und erscheint nicht auf der
                        öffentlichen Karte.
                    </p>
                    <p>xAI-Schlüssel: {configured ? "gesetzt" : "fehlt (XAI_API_KEY)"}</p>
                    {summary ? (
                        <p>
                            Letzte Bewertung: {summary.date} · Score {summary.score} · {summary.rating}
                        </p>
                    ) : (
                        <p className="text-(--admin-muted)">Noch keine gespeicherte Bewertung.</p>
                    )}
                    <AdminButton type="submit" tone="secondary">
                        Heute neu erzeugen
                    </AdminButton>
                </div>
            </AdminBand>
        </AdminImmediateForm>
    );
}
