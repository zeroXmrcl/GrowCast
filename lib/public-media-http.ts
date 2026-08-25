import {isMediaCollectionId, mediaCollectionDir} from "@/lib/media-library";
import {openMediaFile} from "@/lib/open-media-file";

const NO_STORE = "no-store, must-revalidate";
const NO_STORE_ERROR = "no-store";

export async function publicMediaGetResponse(
    collection: string,
    filename: string,
    dirOverride?: string,
): Promise<Response> {
    if (!isMediaCollectionId(collection)) {
        return new Response("Not found", {
            status: 404,
            headers: {"Cache-Control": NO_STORE_ERROR},
        });
    }

    const opened = await openMediaFile(mediaCollectionDir(collection, dirOverride), filename);
    if (!opened.ok) {
        if (opened.status === 400) {
            return new Response("Invalid filename", {
                status: 400,
                headers: {"Cache-Control": NO_STORE_ERROR},
            });
        }
        return new Response("File not found", {
            status: 404,
            headers: {"Cache-Control": NO_STORE_ERROR},
        });
    }

    return new Response(new Uint8Array(opened.buffer), {
        status: 200,
        headers: {
            "Content-Type": opened.contentType,
            "Cache-Control": NO_STORE,
        },
    });
}
