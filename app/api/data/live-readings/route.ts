import {loadPluginLiveReadings} from "@/lib/plugins/hooks";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
    const live = await loadPluginLiveReadings();
    return Response.json(live, {headers: {"Cache-Control": "no-store"}});
}
