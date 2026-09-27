import type {AdminNoticeId} from "@/lib/admin/notice";
import type {Tone} from "@/components/admin/ui";

export const ADMIN_NOTICE_EVENT = "growcast-admin-notice";

export type AdminToastDetail =
    | AdminNoticeId
    | {
        title: string;
        body: string;
        tone: Tone;
    };

export function publishAdminNotice(detail: AdminToastDetail): void {
    if (typeof window === "undefined") {
        return;
    }
    window.dispatchEvent(new CustomEvent<AdminToastDetail>(ADMIN_NOTICE_EVENT, {detail}));
}
