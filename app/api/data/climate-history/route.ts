import {climateHistoryGetResponse} from "@/lib/climate/history-http";
import {withRequestLog} from "@/lib/logging";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET(request: Request) {
    return withRequestLog(request, "/api/data/climate-history", () =>
        climateHistoryGetResponse(request),
    );
}
