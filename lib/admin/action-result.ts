export type AdminActionResult = {
    notice: string;
};

/** These notices mean the write did not land, so the page should keep what was typed. */
const KEEP_PAGE: ReadonlySet<string> = new Set([
    "save_failed",
    "stale_grow",
    "archive_not_confirmed",
    "archive_failed",
    "archive_update_failed",
    "archive_delete_not_confirmed",
    "archive_delete_failed",
    "archive_none_selected",
    "archive_media_delete_failed",
    "media_no_files",
    "media_too_many_files",
    "media_invalid_file",
    "media_encoder_unavailable",
    "media_upload_failed",
    "media_payload_too_large",
    "media_delete_failed",
    "media_rotate_failed",
    "ai_summary_failed",
    "ai_summary_rate_limited",
    "ai_summary_no_key",
    "ai_summary_daily_cap",
]);

export function adminNoticeRefreshes(notice: string): boolean {
    return !KEEP_PAGE.has(notice);
}
