import type {AdminNoticeId} from "@/lib/admin/notice";

export type AdminActionResult = {
    notice: AdminNoticeId;
};

/** These notices mean the write did not land, so the page should keep what was typed. */
const KEEP_PAGE: ReadonlySet<AdminNoticeId> = new Set([
    "save_failed",
    "stale_grow",
    "archive_not_confirmed",
    "archive_failed",
    "archive_update_failed",
    "archive_delete_not_confirmed",
    "archive_delete_failed",
    "archive_none_selected",
    "archive_media_delete_failed",
    "spider_farmer_missing",
    "spider_farmer_bad_password",
    "spider_farmer_unknown_account",
    "spider_farmer_failed",
    "twitch_need_key",
    "twitch_oauth_failed",
    "twitch_need_connect",
    "media_no_files",
    "media_too_many_files",
    "media_invalid_file",
    "media_encoder_unavailable",
    "media_upload_failed",
    "media_payload_too_large",
    "media_delete_failed",
    "media_rotate_failed",
    "music_invalid_file",
    "music_too_many_files",
    "music_payload_too_large",
]);

export function adminNoticeRefreshes(notice: AdminNoticeId): boolean {
    return !KEEP_PAGE.has(notice);
}
