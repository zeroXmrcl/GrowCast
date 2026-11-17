import {withRequestLog} from "@/lib/logging";
import {broadcastGetResponse} from "@/plugins/restream/host/store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
    return withRequestLog(request, "/api/data/broadcast", () => broadcastGetResponse());
}
