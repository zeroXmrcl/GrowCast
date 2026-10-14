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
            <AdminBand id="ai-summary" title="AI Assessment">
                <div className="space-y-3 text-sm text-(--admin-text)">
                    <p className="text-(--admin-muted)">
                        Daily around 08:00 Europe/Berlin. The model gets stage and measured stats, not your
                        climate targets. The timelapse still goes to xAI only and is not shown on the public
                        card. Hard cap: 5 xAI calls per Berlin day (job + regenerate).
                    </p>
                    <p>xAI key: {configured ? "set" : "missing (XAI_API_KEY)"}</p>
                    {summary ? (
                        <p>
                            Latest: {summary.date} · score {summary.score} · {summary.rating}
                        </p>
                    ) : (
                        <p className="text-(--admin-muted)">No saved assessment yet.</p>
                    )}
                    <AdminButton type="submit" tone="secondary">
                        Regenerate today
                    </AdminButton>
                </div>
            </AdminBand>
        </AdminImmediateForm>
    );
}
