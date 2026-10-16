import {getCurrentGrow} from "@/lib/db";
import {parseClimateHistoryRange, type ClimateHistoryPublic} from "@/lib/climate/history-public";
import {readPublicClimateHistory} from "@/lib/climate/history-adapter";

export const CLIMATE_HISTORY_CACHE_CONTROL = "no-store, must-revalidate";

const noStore = {"Cache-Control": CLIMATE_HISTORY_CACHE_CONTROL};

export function climateHistoryGetResponseFromHistory(
    history: ClimateHistoryPublic,
): Response {
    return Response.json(history, {headers: noStore});
}

export async function climateHistoryGetResponse(
    request: Request,
    nowMs: number = Date.now(),
): Promise<Response> {
    const url = new URL(request.url);
    const range = parseClimateHistoryRange(url.searchParams.get("range"));
    if (range === null) {
        return Response.json({error: "invalid_range"}, {status: 400, headers: noStore});
    }
    const grow = await getCurrentGrow();
    const history = await readPublicClimateHistory({
        nowMs,
        seededAt: grow.details.seededAt,
        range,
    });
    return climateHistoryGetResponseFromHistory(history);
}
