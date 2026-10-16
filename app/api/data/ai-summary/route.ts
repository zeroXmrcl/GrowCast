import {aiSummaryWidgetEnabled} from "@/lib/ai-summary/config";
import {assertPublicSafe, readAiSummaryPublic} from "@/lib/ai-summary/public";
import {withRequestLog} from "@/lib/logging";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const noStore = {"Cache-Control": "no-store, must-revalidate"};

export async function GET(request: Request) {
    return withRequestLog(request, "/api/data/ai-summary", async () => {
        if (!aiSummaryWidgetEnabled()) {
            return Response.json({available: false}, {headers: noStore});
        }
        const {summary} = await readAiSummaryPublic();
        if (!summary) {
            return Response.json({available: false}, {headers: noStore});
        }
        try {
            assertPublicSafe(summary);
        } catch {
            return Response.json({available: false}, {headers: noStore});
        }
        return Response.json({available: true, ...summary}, {headers: noStore});
    });
}
