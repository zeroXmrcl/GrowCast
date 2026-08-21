/**
 * CSRF gate for cookie-authenticated form POSTs that are not Next server actions.
 * Server actions check origin internally; route-handler forms must do it here.
 */
export function isSameOriginRequest(request: Request): boolean {
    const expected = new URL(request.url).origin;
    const origin = request.headers.get("origin");
    if (origin) {
        return origin === expected;
    }

    const referer = request.headers.get("referer");
    if (!referer) {
        return false;
    }

    try {
        return new URL(referer).origin === expected;
    } catch {
        return false;
    }
}
