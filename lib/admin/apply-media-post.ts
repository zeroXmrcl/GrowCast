import {
    deleteMediaFile,
    isMediaCollectionId,
    rotateMediaFile,
    saveUploadedImages,
    type MediaCollectionId,
} from "@/lib/media-library";
import type {AdminNoticeId} from "@/lib/admin/notice";

export type ApplyMediaPostResult =
    | {
          ok: true;
          notice: "uploaded";
          collection: MediaCollectionId;
          saved: number;
          rejected: number;
      }
    | {
          ok: true;
          notice: "uploaded_partial";
          collection: MediaCollectionId;
          saved: number;
          rejected: number;
      }
    | {
          ok: true;
          notice: "deleted";
          collection: MediaCollectionId;
          filename: string;
      }
    | {
          ok: true;
          notice: "rotated";
          collection: MediaCollectionId;
          filename: string;
      }
    | {
          ok: false;
          notice: AdminNoticeId;
          reason: string;
          collection?: string;
          filename?: string;
          rejected?: number;
      };

function isNonEmptyUpload(entry: FormDataEntryValue): entry is File {
    if (typeof entry === "string") {
        return false;
    }
    return typeof entry.size === "number" && entry.size > 0 && typeof entry.arrayBuffer === "function";
}

export async function applyMediaPost(formData: FormData): Promise<ApplyMediaPostResult> {
    const intent = String(formData.get("intent") ?? "");
    const collection = String(formData.get("collection") ?? "");

    if (intent === "delete") {
        return applyDelete(collection, String(formData.get("filename") ?? ""));
    }
    if (intent === "rotate") {
        return applyRotate(collection, String(formData.get("filename") ?? ""));
    }
    if (intent === "upload") {
        return applyUpload(collection, formData);
    }

    return {ok: false, notice: "media_upload_failed", reason: "invalid_intent"};
}

async function applyUpload(
    collection: string,
    formData: FormData,
): Promise<ApplyMediaPostResult> {
    if (!isMediaCollectionId(collection)) {
        return {ok: false, notice: "media_upload_failed", reason: "invalid_collection"};
    }

    const files = formData.getAll("files").filter(isNonEmptyUpload);

    const result = await saveUploadedImages(collection, files);
    if (!result.ok) {
        return {
            ok: false,
            notice: result.error === "no_files" ? "media_no_files" : "media_too_many_files",
            reason: result.error,
            collection,
        };
    }

    if (result.saved.length === 0) {
        const encoderOnly =
            result.rejected.length > 0
            && result.rejected.every((entry) => entry.reason === "encoder_unavailable");
        return {
            ok: false,
            notice: encoderOnly ? "media_encoder_unavailable" : "media_invalid_file",
            reason: encoderOnly ? "encoder_unavailable" : "all_rejected",
            collection,
            rejected: result.rejected.length,
        };
    }

    if (result.rejected.length > 0) {
        return {
            ok: true,
            notice: "uploaded_partial",
            collection,
            saved: result.saved.length,
            rejected: result.rejected.length,
        };
    }

    return {
        ok: true,
        notice: "uploaded",
        collection,
        saved: result.saved.length,
        rejected: result.rejected.length,
    };
}

async function applyDelete(
    collection: string,
    filename: string,
): Promise<ApplyMediaPostResult> {
    if (!isMediaCollectionId(collection)) {
        return {ok: false, notice: "media_delete_failed", reason: "invalid_collection"};
    }

    const result = await deleteMediaFile(collection, filename);
    if (!result.ok) {
        return {ok: false, notice: "media_delete_failed", reason: result.error, collection, filename};
    }

    return {ok: true, notice: "deleted", collection, filename};
}

async function applyRotate(
    collection: string,
    filename: string,
): Promise<ApplyMediaPostResult> {
    if (!isMediaCollectionId(collection)) {
        return {ok: false, notice: "media_rotate_failed", reason: "invalid_collection"};
    }

    const result = await rotateMediaFile(collection, filename);
    if (!result.ok) {
        return {ok: false, notice: "media_rotate_failed", reason: result.error, collection, filename};
    }

    return {ok: true, notice: "rotated", collection, filename: result.filename};
}
