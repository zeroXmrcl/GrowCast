import {publicRequestOrigin} from "@/lib/request-trust";

function originsEqual(left: string, right: string): boolean {
    try {
        return new URL(left).origin === new URL(right).origin;
    } catch {
        return left === right;
    }
}

/**
 * CSRF gate for cookie-authenticated form POSTs that are not Next server actions.
 *
 * Prefer Sec-Fetch-Site (browser-attested, works behind Cloudflare Tunnel even
 * when Host is rewritten). Otherwise compare Origin/Referer to the public host,
 * never to the listen address in request.url (e.g. http://0.0.0.0:3000).
 */
export function isSameOriginRequest(request: Request): boolean {
    const fetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
    if (fetchSite) {
        return fetchSite === "same-origin";
    }

    const expected = publicRequestOrigin(request);
    const origin = request.headers.get("origin");
    if (origin) {
        if (origin === "null") {
            return false;
        }
        return originsEqual(origin, expected);
    }

    const referer = request.headers.get("referer");
    if (!referer) {
        return false;
    }

    try {
        return originsEqual(new URL(referer).origin, expected);
    } catch {
        return false;
    }
}
