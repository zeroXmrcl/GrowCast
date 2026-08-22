import Link from "next/link";
import {AdminNotice, type Tone} from "@/components/admin/ui";
import {isAdminNoticeId, type AdminNoticeId} from "@/lib/admin/notice";
import type {ReactNode} from "react";

type NoticeContent = {tone: Tone; title: string; body: ReactNode};

const NOTICES: Record<AdminNoticeId, NoticeContent> = {
    saved: {tone: "success", title: "Configuration saved", body: "Done."},
    archived: {
        tone: "success",
        title: "Grow archived",
        body: (
            <>
                The grow was moved to the archive and the current grow was reset.{" "}
                <Link href="/grows" className="underline" target="_blank">
                    View past grows
                </Link>
            </>
        ),
    },
    save_failed: {
        tone: "danger",
        title: "Save failed",
        body: "Could not save all settings. Review logs and try again.",
    },
    stale_grow: {
        tone: "warning",
        title: "Grow already changed",
        body: "This grow was archived or replaced. Reload Settings and try again.",
    },
    archive_failed: {
        tone: "danger",
        title: "Archive failed",
        body: "Could not archive the grow. Review logs and try again — the current grow was left untouched.",
    },
    archive_not_confirmed: {
        tone: "warning",
        title: "Archive not confirmed",
        body: "Tick the confirmation checkbox to complete and archive the grow.",
    },
    uploaded: {tone: "success", title: "Pictures uploaded", body: "Done."},
    uploaded_partial: {
        tone: "warning",
        title: "Some pictures were skipped",
        body: "Files that are not valid JPEG/PNG/WebP images or exceed 15 MB were skipped. The rest were uploaded.",
    },
    deleted: {tone: "success", title: "Picture deleted", body: "Done."},
    media_no_files: {
        tone: "warning",
        title: "No files selected",
        body: "Choose at least one image to upload.",
    },
    media_too_many_files: {
        tone: "warning",
        title: "Too many files",
        body: "Upload at most 10 files at a time.",
    },
    media_invalid_file: {
        tone: "danger",
        title: "Upload failed",
        body: "None of the files were valid JPEG/PNG/WebP images under 15 MB.",
    },
    media_upload_failed: {
        tone: "danger",
        title: "Upload failed",
        body: "Could not save the pictures. Review logs and try again.",
    },
    media_delete_failed: {
        tone: "danger",
        title: "Delete failed",
        body: "Could not delete the picture. Review logs and try again.",
    },
    archive_updated: {tone: "success", title: "Archive updated", body: "Done."},
    archive_deleted: {
        tone: "success",
        title: "Archive deleted",
        body: "The archive and all of its media were removed.",
    },
    archive_not_found: {
        tone: "danger",
        title: "Archive not found",
        body: "The requested archive does not exist.",
    },
    archive_update_failed: {
        tone: "danger",
        title: "Update failed",
        body: "Could not save the archive details. Review logs and try again.",
    },
    archive_media_deleted: {tone: "success", title: "Files deleted", body: "Done."},
    archive_media_delete_failed: {
        tone: "danger",
        title: "Delete failed",
        body: "Could not delete the selected files. Review logs and try again.",
    },
    archive_none_selected: {
        tone: "warning",
        title: "Nothing selected",
        body: "Tick at least one file to delete.",
    },
    archive_delete_not_confirmed: {
        tone: "warning",
        title: "Deletion not confirmed",
        body: "Tick the confirmation checkbox to delete the archive.",
    },
    archive_delete_failed: {
        tone: "danger",
        title: "Delete failed",
        body: "Could not delete the archive. Review logs and try again.",
    },
};

export function AdminFlashNotice({notice}: {notice?: string}) {
    if (!notice || !isAdminNoticeId(notice)) {
        return null;
    }

    const content = NOTICES[notice];
    return (
        <AdminNotice tone={content.tone} title={content.title}>
            {content.body}
        </AdminNotice>
    );
}
