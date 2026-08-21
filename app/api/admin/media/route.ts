import {revalidatePath} from "next/cache";
import {NextResponse} from "next/server";
import {requireAdmin} from "@/lib/admin-auth";
import {
    deleteMediaFile,
    isMediaCollectionId,
    saveUploadedImages,
    type SaveUploadedImagesResult,
} from "@/lib/media-library";
import {
    logAdminMediaDeleteFailed,
    logAdminMediaDeleted,
    logAdminMediaUploadFailed,
    logAdminMediaUploaded,
    sanitizeError,
    withRequestLog,
} from "@/lib/logging";
import {isSameOriginRequest} from "@/lib/same-origin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function seeOther(request: Request, path: string): NextResponse {
    return NextResponse.redirect(new URL(path, request.url), 303);
}

function refreshAdmin(): void {
    revalidatePath("/");
    revalidatePath("/admin");
}

async function handleUpload(request: Request, formData: FormData): Promise<NextResponse> {
    const collection = String(formData.get("collection") ?? "");
    if (!isMediaCollectionId(collection)) {
        logAdminMediaUploadFailed({reason: "invalid_collection"});
        return seeOther(request, "/admin?error=media_upload_failed");
    }

    const files = formData
        .getAll("files")
        .filter((entry): entry is File => entry instanceof File && entry.size > 0);

    let result: SaveUploadedImagesResult;
    try {
        result = await saveUploadedImages(collection, files);
    } catch (error) {
        logAdminMediaUploadFailed({collection, err: sanitizeError(error)});
        return seeOther(request, "/admin?error=media_upload_failed");
    }

    if (!result.ok) {
        logAdminMediaUploadFailed({collection, reason: result.error});
        return seeOther(request, `/admin?error=media_${result.error}`);
    }

    if (result.saved.length === 0) {
        logAdminMediaUploadFailed({
            collection,
            reason: "all_rejected",
            rejected: result.rejected.length,
        });
        return seeOther(request, "/admin?error=media_invalid_file");
    }

    logAdminMediaUploaded({
        collection,
        count: result.saved.length,
        rejected: result.rejected.length,
    });
    refreshAdmin();
    return seeOther(
        request,
        result.rejected.length > 0
            ? "/admin?media=uploaded_partial"
            : "/admin?media=uploaded",
    );
}

async function handleDelete(request: Request, formData: FormData): Promise<NextResponse> {
    const collection = String(formData.get("collection") ?? "");
    const filename = String(formData.get("filename") ?? "");

    if (!isMediaCollectionId(collection)) {
        logAdminMediaDeleteFailed({reason: "invalid_collection"});
        return seeOther(request, "/admin?error=media_delete_failed");
    }

    const result = await deleteMediaFile(collection, filename);

    if (!result.ok) {
        logAdminMediaDeleteFailed({collection, filename, reason: result.error});
        return seeOther(request, "/admin?error=media_delete_failed");
    }

    logAdminMediaDeleted({collection, filename});
    refreshAdmin();
    return seeOther(request, "/admin?media=deleted");
}

export async function POST(request: Request) {
    if (!isSameOriginRequest(request)) {
        return seeOther(request, "/admin?error=media_upload_failed");
    }

    await requireAdmin();

    return withRequestLog(request, "/api/admin/media", async () => {
        const formData = await request.formData();
        const intent = String(formData.get("intent") ?? "");

        if (intent === "delete") {
            return handleDelete(request, formData);
        }
        if (intent === "upload") {
            return handleUpload(request, formData);
        }

        logAdminMediaUploadFailed({reason: "invalid_intent"});
        return seeOther(request, "/admin?error=media_upload_failed");
    });
}
