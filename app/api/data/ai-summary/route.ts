import {readAiSummaryPublic} from "@/lib/ai-summary/public";
import {withRequestLog} from "@/lib/logging";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET(request: Request) {
    return withRequestLog(request, "/api/data/ai-summary", async () => {
        const summary = await readAiSummaryPublic();
        return Response.json(
            summary ? {available: true, ...summary} : {available: false},
            {
                headers: {"Cache-Control": "no-store, must-revalidate"},
            },
        );
    });
}
