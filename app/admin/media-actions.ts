"use server";

import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
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
    withNextRequestLogContext,
} from "@/lib/logging";

export async function uploadMediaAction(formData: FormData): Promise<void> {
    await withNextRequestLogContext("/admin", async () => {
        await requireAdmin();

        const collection = String(formData.get("collection") ?? "");
        if (!isMediaCollectionId(collection)) {
            logAdminMediaUploadFailed({reason: "invalid_collection"});
            redirect("/admin?error=media_upload_failed");
        }

        const files = formData
            .getAll("files")
            .filter((entry): entry is File => entry instanceof File && entry.size > 0);

        let result: SaveUploadedImagesResult;
        try {
            result = await saveUploadedImages(collection, files);
        } catch (error) {
            logAdminMediaUploadFailed({collection, err: sanitizeError(error)});
            redirect("/admin?error=media_upload_failed");
        }

        if (!result.ok) {
            logAdminMediaUploadFailed({collection, reason: result.error});
            redirect(`/admin?error=media_${result.error}`);
        }

        if (result.saved.length === 0) {
            logAdminMediaUploadFailed({
                collection,
                reason: "all_rejected",
                rejected: result.rejected.length,
            });
            redirect("/admin?error=media_invalid_file");
        }

        logAdminMediaUploaded({
            collection,
            count: result.saved.length,
            rejected: result.rejected.length,
        });
        revalidatePath("/");
        revalidatePath("/admin");
        redirect(
            result.rejected.length > 0
                ? "/admin?media=uploaded_partial"
                : "/admin?media=uploaded",
        );
    });
}

export async function deleteMediaAction(formData: FormData): Promise<void> {
    await withNextRequestLogContext("/admin", async () => {
        await requireAdmin();

        const collection = String(formData.get("collection") ?? "");
        const filename = String(formData.get("filename") ?? "");

        if (!isMediaCollectionId(collection)) {
            logAdminMediaDeleteFailed({reason: "invalid_collection"});
            redirect("/admin?error=media_delete_failed");
        }

        const result = await deleteMediaFile(collection, filename);

        if (!result.ok) {
            logAdminMediaDeleteFailed({collection, filename, reason: result.error});
            redirect("/admin?error=media_delete_failed");
        }

        logAdminMediaDeleted({collection, filename});
        revalidatePath("/");
        revalidatePath("/admin");
        redirect("/admin?media=deleted");
    });
}
