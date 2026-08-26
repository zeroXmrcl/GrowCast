import {withRequestLog} from "@/lib/logging";
import {broadcastGetResponse} from "@/lib/restream/store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
    return withRequestLog(request, "/api/data/broadcast", () => broadcastGetResponse());
}
