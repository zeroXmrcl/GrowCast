import {publicMediaGetResponse} from "@/lib/public-media-http";
import {
    logHttpPathTraversalBlocked,
    withRequestLog,
} from "@/lib/logging";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
    request: Request,
    context: {params: Promise<{filename: string}>},
) {
    return withRequestLog(request, "/setup/:filename", async () => {
        const {filename} = await context.params;
        const response = await publicMediaGetResponse("setup", filename);
        if (response.status === 400) {
            logHttpPathTraversalBlocked({reason: "invalid_filename"});
        }
        return response;
    });
}
