import {isUsableSeededAt} from "@/lib/ai-summary/stage";
import {getCurrentGrow} from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
    const grow = await getCurrentGrow();
    const startedAt = isUsableSeededAt(grow.details.seededAt) ? grow.details.seededAt : null;
    return Response.json({
        active: startedAt !== null,
        startedAt,
        endedAt: null,
    }, {headers: {"Cache-Control": "no-store"}});
}
