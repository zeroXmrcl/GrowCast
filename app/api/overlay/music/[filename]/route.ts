import {isAdminAuthenticated} from "@/lib/admin-auth";
import {withRequestLog} from "@/lib/logging";
import {programMusicGetResponse} from "@/lib/restream/program-http";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
    request: Request,
    context: {params: Promise<{filename: string}>},
) {
    return withRequestLog(request, "/api/overlay/music/:filename", async () => {
        const {filename} = await context.params;
        const admin = await isAdminAuthenticated();
        return programMusicGetResponse(request, filename, {admin});
    });
}
