"use server";

import {revalidatePath} from "next/cache";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {loginAdmin, requireAdmin} from "@/lib/admin-auth";
import {parseAdminSettingsForm, parseCompleteGrowForm} from "@/lib/admin/parse-grow-form";
import {saveAdminSettings} from "@/lib/admin/save-settings";
import {completeCurrentGrow} from "@/lib/archives";
import {
    deleteMediaFile,
    isMediaCollectionId,
    saveUploadedImages,
    type SaveUploadedImagesResult,
} from "@/lib/media-library";
import {
    extractClientIp,
    logAdminGrowArchiveFailed,
    logAdminGrowArchived,
    logAdminGrowUpdateFailed,
    logAdminGrowUpdated,
    logAdminMediaDeleteFailed,
    logAdminMediaDeleted,
    logAdminMediaUploadFailed,
    logAdminMediaUploaded,
    sanitizeError,
    withNextRequestLogContext,
} from "@/lib/logging";

async function getRequestIp(): Promise<string> {
    const h = await headers();
    return extractClientIp(h) ?? "unknown";
}

export async function loginAction(formData: FormData): Promise<void> {
    const ip = await getRequestIp();
    const clientKey = `admin-login:${ip}`;

    const username = String(formData.get("username") ?? "");
    const password = String(formData.get("password") ?? "");

    const result = await loginAdmin(username, password, clientKey);

    if (!result.ok) {
        if (result.code === "rate_limited") {
            redirect(`/admin?error=rate_limited&retry=${result.retryAfterSeconds ?? 900}`);
        }

        if (result.code === "login_disabled") {
            redirect("/admin?error=login_disabled");
        }

        redirect("/admin?error=invalid_credentials");
    }

    redirect("/admin");
}

export async function saveGrowAction(formData: FormData): Promise<void> {
    await withNextRequestLogContext("/admin", async () => {
        await requireAdmin();

        const parsed = parseAdminSettingsForm(formData);
        const result = await saveAdminSettings(parsed);

        if (!result.ok) {
            logAdminGrowUpdateFailed({err: sanitizeError(result.error)});
            redirect("/admin?error=save_failed");
        }

        logAdminGrowUpdated();
        revalidatePath("/");
        revalidatePath("/admin");
        redirect("/admin?saved=1");
    });
}

export async function completeGrowAction(formData: FormData): Promise<void> {
    await withNextRequestLogContext("/admin", async () => {
        await requireAdmin();

        if (formData.get("confirmArchive") !== "on") {
            redirect("/admin?error=archive_not_confirmed");
        }

        const input = parseCompleteGrowForm(formData);
        const result = await completeCurrentGrow(input);

        if (!result.ok) {
            logAdminGrowArchiveFailed({err: sanitizeError(result.error)});
            redirect("/admin?error=archive_failed");
        }

        logAdminGrowArchived({archiveId: result.archive.archiveId});
        revalidatePath("/");
        revalidatePath("/gallery");
        revalidatePath("/grows");
        revalidatePath(`/grows/${result.archive.archiveId}`);
        revalidatePath("/admin");
        redirect("/admin?archived=1");
    });
}

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
