export function noticeJson(notice: string, status = 200): Response {
    return Response.json({notice}, {
        status,
        headers: {"Content-Type": "application/json; charset=utf-8"},
    });
}
