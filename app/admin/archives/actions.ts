"use server";

import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {requireAdmin} from "@/lib/admin-auth";
import {withNotice} from "@/lib/admin/notice";
import {parseArchiveEditForm} from "@/lib/admin/parse-grow-form";
import {
    deleteArchiveMediaFiles,
    deleteArchivedGrow,
    isArchiveMediaKind,
    isValidArchiveId,
    updateArchivedGrow,
} from "@/lib/archives";
import {
    logAdminArchiveDeleteFailed,
    logAdminArchiveDeleted,
    logAdminArchiveMediaDeleteFailed,
    logAdminArchiveMediaDeleted,
    logAdminArchiveUpdateFailed,
    logAdminArchiveUpdated,
    withNextRequestLogContext,
} from "@/lib/logging";

function editorPath(archiveId: string): string {
    return `/admin/archives/${archiveId}`;
}

function revalidateArchivePages(archiveId: string): void {
    revalidatePath("/grows");
    revalidatePath(`/grows/${archiveId}`);
    revalidatePath("/admin/archives");
    revalidatePath(editorPath(archiveId));
}

export async function updateArchiveAction(formData: FormData): Promise<void> {
    await withNextRequestLogContext("/admin/archives", async () => {
        await requireAdmin();

        const archiveId = String(formData.get("archiveId") ?? "");
        if (!isValidArchiveId(archiveId)) {
            logAdminArchiveUpdateFailed({reason: "invalid_archive_id"});
            redirect(withNotice("/admin/archives", "archive_not_found"));
        }

        const edits = parseArchiveEditForm(formData);
        const result = await updateArchivedGrow(archiveId, edits);

        if (!result.ok) {
            logAdminArchiveUpdateFailed({archiveId, reason: result.error});
            redirect(
                result.error === "not_found"
                    ? withNotice("/admin/archives", "archive_not_found")
                    : withNotice(editorPath(archiveId), "archive_update_failed"),
            );
        }

        logAdminArchiveUpdated({archiveId});
        revalidateArchivePages(archiveId);
        redirect(withNotice(editorPath(archiveId), "archive_updated"));
    });
}

export async function deleteArchiveMediaAction(formData: FormData): Promise<void> {
    await withNextRequestLogContext("/admin/archives", async () => {
        await requireAdmin();

        const archiveId = String(formData.get("archiveId") ?? "");
        if (!isValidArchiveId(archiveId)) {
            logAdminArchiveMediaDeleteFailed({reason: "invalid_archive_id"});
            redirect(withNotice("/admin/archives", "archive_not_found"));
        }

        const kind = String(formData.get("kind") ?? "");
        if (!isArchiveMediaKind(kind)) {
            logAdminArchiveMediaDeleteFailed({archiveId, reason: "invalid_kind"});
            redirect(withNotice(editorPath(archiveId), "archive_media_delete_failed"));
        }

        const filenames = formData.getAll("filenames").map(String);
        if (filenames.length === 0) {
            redirect(withNotice(editorPath(archiveId), "archive_none_selected"));
        }

        const result = await deleteArchiveMediaFiles(archiveId, kind, filenames);

        if (!result.ok) {
            logAdminArchiveMediaDeleteFailed({archiveId, kind, reason: result.error});
            redirect(
                result.error === "not_found"
                    ? withNotice("/admin/archives", "archive_not_found")
                    : withNotice(editorPath(archiveId), "archive_media_delete_failed"),
            );
        }

        logAdminArchiveMediaDeleted({archiveId, kind, deleted: result.deleted});
        revalidateArchivePages(archiveId);
        redirect(withNotice(editorPath(archiveId), "archive_media_deleted"));
    });
}

export async function deleteArchiveAction(formData: FormData): Promise<void> {
    await withNextRequestLogContext("/admin/archives", async () => {
        await requireAdmin();

        const archiveId = String(formData.get("archiveId") ?? "");
        if (!isValidArchiveId(archiveId)) {
            logAdminArchiveDeleteFailed({reason: "invalid_archive_id"});
            redirect(withNotice("/admin/archives", "archive_not_found"));
        }

        if (formData.get("confirmDelete") !== "on") {
            redirect(withNotice(editorPath(archiveId), "archive_delete_not_confirmed"));
        }

        const result = await deleteArchivedGrow(archiveId);

        if (!result.ok) {
            logAdminArchiveDeleteFailed({archiveId, reason: result.error});
            redirect(
                result.error === "not_found"
                    ? withNotice("/admin/archives", "archive_not_found")
                    : withNotice(editorPath(archiveId), "archive_delete_failed"),
            );
        }

        logAdminArchiveDeleted({archiveId});
        revalidateArchivePages(archiveId);
        redirect(withNotice("/admin/archives", "archive_deleted"));
    });
}
