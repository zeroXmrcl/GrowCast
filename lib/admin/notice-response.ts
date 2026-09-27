import type {AdminNoticeId} from "@/lib/admin/notice";

export function noticeJson(notice: AdminNoticeId, status = 200): Response {
    return Response.json({notice}, {
        status,
        headers: {"Content-Type": "application/json; charset=utf-8"},
    });
}
