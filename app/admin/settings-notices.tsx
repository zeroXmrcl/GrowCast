import Link from "next/link";
import {AdminNotice, type Tone} from "@/components/admin/ui";
import type {ReactNode} from "react";

type NoticeContent = {tone: Tone; title: string; body: ReactNode};

const SETTINGS_NOTICES: Record<string, NoticeContent> = {
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
};

export function settingsNoticeFromQuery(query: {
    saved?: string;
    archived?: string;
    media?: string;
    error?: string;
}): NoticeContent | null {
    if (query.saved) {
        return SETTINGS_NOTICES.saved;
    }
    if (query.archived) {
        return SETTINGS_NOTICES.archived;
    }
    if (query.media && SETTINGS_NOTICES[query.media]) {
        return SETTINGS_NOTICES[query.media];
    }
    if (query.error && SETTINGS_NOTICES[query.error]) {
        return SETTINGS_NOTICES[query.error];
    }
    return null;
}

export function SettingsNotice(query: {
    saved?: string;
    archived?: string;
    media?: string;
    error?: string;
}) {
    const notice = settingsNoticeFromQuery(query);
    if (!notice) {
        return null;
    }

    return (
        <AdminNotice tone={notice.tone} title={notice.title}>
            {notice.body}
        </AdminNotice>
    );
}
