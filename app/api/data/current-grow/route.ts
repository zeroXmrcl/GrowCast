import {getCurrentGrow} from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
    const data = await getCurrentGrow();

    return Response.json(data, {
        headers: {
            "Cache-Control": "no-store, must-revalidate",
        },
    });
}
