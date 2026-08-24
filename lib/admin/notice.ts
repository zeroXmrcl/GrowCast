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
    "media_no_files",
    "media_too_many_files",
    "media_invalid_file",
    "media_upload_failed",
    "media_payload_too_large",
    "media_delete_failed",
    "archive_updated",
    "archive_deleted",
    "archive_not_found",
    "archive_update_failed",
    "archive_media_deleted",
    "archive_media_delete_failed",
    "archive_none_selected",
    "archive_delete_not_confirmed",
    "archive_delete_failed",
] as const;

export type AdminNoticeId = (typeof ADMIN_NOTICE_IDS)[number];

export function isAdminNoticeId(value: string): value is AdminNoticeId {
    return (ADMIN_NOTICE_IDS as readonly string[]).includes(value);
}

export function withNotice(path: string, notice: AdminNoticeId): string {
    return `${path}?notice=${notice}`;
}
