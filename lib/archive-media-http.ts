import {archiveMediaDir, isArchiveMediaKind, isValidArchiveId} from "@/lib/archives";
import {openMediaFile} from "@/lib/open-media-file";
import {IMAGE_EXTENSIONS, VIDEO_EXTENSIONS} from "@/lib/safe-media-filename";

export const ARCHIVE_MEDIA_CACHE_CONTROL = "no-store, must-revalidate";
export const ARCHIVE_MEDIA_ERROR_CACHE_CONTROL = "no-store";

export async function archiveMediaGetResponse(
    archiveId: string,
    kind: string,
    filename: string,
): Promise<Response> {
    if (!isValidArchiveId(archiveId) || !isArchiveMediaKind(kind)) {
        return new Response("Not found", {
            status: 404,
            headers: {"Cache-Control": ARCHIVE_MEDIA_ERROR_CACHE_CONTROL},
        });
    }

    const allowed = kind === "timelapse" ? VIDEO_EXTENSIONS : IMAGE_EXTENSIONS;
    const opened = await openMediaFile(archiveMediaDir(archiveId, kind), filename, allowed);
    if (!opened.ok) {
        if (opened.status === 400) {
            return new Response("Invalid filename", {
                status: 400,
                headers: {"Cache-Control": ARCHIVE_MEDIA_ERROR_CACHE_CONTROL},
            });
        }
        return new Response("File not found", {
            status: 404,
            headers: {"Cache-Control": ARCHIVE_MEDIA_ERROR_CACHE_CONTROL},
        });
    }

    return new Response(new Uint8Array(opened.buffer), {
        status: 200,
        headers: {
            "Content-Type": opened.contentType,
            "Cache-Control": ARCHIVE_MEDIA_CACHE_CONTROL,
        },
    });
}
