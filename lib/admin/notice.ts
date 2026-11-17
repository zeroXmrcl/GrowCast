export const ADMIN_NOTICE_IDS = [
    "saved",
    "archived",
    "archived_reset_warning",
    "archived_cleanup_warning",
    "save_failed",
    "stale_grow",
    "archive_failed",
    "archive_not_confirmed",
    "uploaded",
    "uploaded_partial",
    "deleted",
    "rotated",
    "media_no_files",
    "media_too_many_files",
    "media_invalid_file",
    "media_encoder_unavailable",
    "media_upload_failed",
    "media_payload_too_large",
    "media_delete_failed",
    "media_rotate_failed",
    "archive_updated",
    "archive_deleted",
    "archive_not_found",
    "archive_update_failed",
    "archive_media_deleted",
    "archive_media_delete_failed",
    "archive_none_selected",
    "archive_delete_not_confirmed",
    "archive_delete_failed",
    "ai_summary_ready",
    "ai_summary_failed",
    "ai_summary_rate_limited",
    "ai_summary_no_key",
    "ai_summary_daily_cap",
] as const;

export type AdminNoticeId = (typeof ADMIN_NOTICE_IDS)[number];

export function isAdminNoticeId(value: string): value is AdminNoticeId {
    return (ADMIN_NOTICE_IDS as readonly string[]).includes(value);
}

export function withNotice(path: string, notice: string): string {
    return `${path}?notice=${notice}`;
}
