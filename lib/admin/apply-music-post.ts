import type {AdminNoticeId} from "@/lib/admin/notice";
import {deleteMusicFile, saveMusicFile} from "@/lib/restream/music-files";

export type ApplyMusicPostResult =
    | {
          ok: true;
          notice: "music_uploaded";
          saved: number;
      }
    | {
          ok: true;
          notice: "music_uploaded_partial";
          saved: number;
          rejected: number;
      }
    | {
          ok: true;
          notice: "music_deleted";
          filename: string;
      }
    | {
          ok: false;
          notice: AdminNoticeId;
          reason: string;
          filename?: string;
      };

function isNonEmptyUpload(entry: FormDataEntryValue): entry is File {
    if (typeof entry === "string") {
        return false;
    }
    return typeof entry.size === "number" && entry.size > 0 && typeof entry.arrayBuffer === "function";
}

export async function applyMusicPost(formData: FormData): Promise<ApplyMusicPostResult> {
    const intent = String(formData.get("intent") ?? "");
    if (intent === "delete") {
        return applyDelete(String(formData.get("filename") ?? ""));
    }
    if (intent === "upload") {
        return applyUpload(formData);
    }
    return {ok: false, notice: "music_invalid_file", reason: "invalid_intent"};
}

async function applyUpload(formData: FormData): Promise<ApplyMusicPostResult> {
    const files = formData.getAll("file").filter(isNonEmptyUpload);
    if (files.length === 0) {
        return {ok: false, notice: "music_invalid_file", reason: "no_file"};
    }

    let saved = 0;
    let rejected = 0;
    let tooMany = false;
    let lastError = "invalid_file";

    for (const entry of files) {
        const data = Buffer.from(await entry.arrayBuffer());
        const result = await saveMusicFile(entry.name, data);
        if (result.ok) {
            saved += 1;
            continue;
        }
        rejected += 1;
        lastError = result.error;
        if (result.error === "too_many") {
            tooMany = true;
        }
    }

    if (saved === 0) {
        return {
            ok: false,
            notice: tooMany ? "music_too_many_files" : "music_invalid_file",
            reason: tooMany ? "too_many" : lastError,
        };
    }

    if (rejected > 0) {
        return {ok: true, notice: "music_uploaded_partial", saved, rejected};
    }

    return {ok: true, notice: "music_uploaded", saved};
}

async function applyDelete(filename: string): Promise<ApplyMusicPostResult> {
    const result = await deleteMusicFile(filename);
    if (!result.ok) {
        return {ok: false, notice: "music_invalid_file", reason: result.error, filename};
    }

    return {ok: true, notice: "music_deleted", filename};
}
