import {getCurrentGrow} from "@/lib/db";
import {withRequestLog} from "@/lib/logging";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
    return withRequestLog(request, "/api/data/current-grow", async () => {
        const data = await getCurrentGrow();

        return Response.json(data, {
            headers: {
                "Cache-Control": "no-store, must-revalidate",
            },
        });
    });
}
