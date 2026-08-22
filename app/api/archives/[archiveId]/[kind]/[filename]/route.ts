import {isArchiveMediaKind, isValidArchiveId} from "@/lib/archives";
import {archiveMediaGetResponse} from "@/lib/archive-media-http";
import {
    logHttpPathTraversalBlocked,
    withRequestLog,
} from "@/lib/logging";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
    request: Request,
    context: { params: Promise<{ archiveId: string; kind: string; filename: string }> }
) {
    return withRequestLog(request, "/api/archives/:archiveId/:kind/:filename", async () => {
        const { archiveId, kind, filename } = await context.params;
        const response = await archiveMediaGetResponse(archiveId, kind, filename);
        if (response.status === 404 && (!isValidArchiveId(archiveId) || !isArchiveMediaKind(kind))) {
            logHttpPathTraversalBlocked({ reason: "invalid_archive_path" });
        } else if (response.status === 400) {
            logHttpPathTraversalBlocked({ reason: "invalid_filename" });
        }
        return response;
    });
}
