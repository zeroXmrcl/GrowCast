import type {AdminNoticeId} from "@/lib/admin/notice";
import {deleteMusicFile, saveMusicFile} from "@/lib/restream/music-files";

export type ApplyMusicPostResult =
    | {
          ok: true;
          notice: "music_uploaded";
          filename: string;
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

function isNonEmptyUpload(entry: FormDataEntryValue | null): entry is File {
    if (entry == null || typeof entry === "string") {
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
        return applyUpload(formData.get("file"));
    }
    return {ok: false, notice: "music_invalid_file", reason: "invalid_intent"};
}

async function applyUpload(entry: FormDataEntryValue | null): Promise<ApplyMusicPostResult> {
    if (!isNonEmptyUpload(entry)) {
        return {ok: false, notice: "music_invalid_file", reason: "no_file"};
    }

    const data = Buffer.from(await entry.arrayBuffer());
    const result = await saveMusicFile(entry.name, data);
    if (!result.ok) {
        return {
            ok: false,
            notice: result.error === "too_many" ? "music_too_many_files" : "music_invalid_file",
            reason: result.error,
            filename: entry.name,
        };
    }

    return {ok: true, notice: "music_uploaded", filename: result.filename};
}

async function applyDelete(filename: string): Promise<ApplyMusicPostResult> {
    const result = await deleteMusicFile(filename);
    if (!result.ok) {
        return {ok: false, notice: "music_invalid_file", reason: result.error, filename};
    }

    return {ok: true, notice: "music_deleted", filename};
}
