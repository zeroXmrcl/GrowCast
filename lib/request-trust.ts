import {isIP} from "node:net";

function headerGet(
    headers: Headers | Record<string, string | string[] | undefined>,
    name: string,
): string | undefined {
    if (typeof (headers as Headers).get === "function") {
        const v = (headers as Headers).get(name);
        return v == null || v === "" ? undefined : v;
    }
    const rec = headers as Record<string, string | string[] | undefined>;
    const lower = name.toLowerCase();
    for (const key of Object.keys(rec)) {
        if (key.toLowerCase() === lower) {
            const val = rec[key];
            if (Array.isArray(val)) {
                return val[0];
            }
            if (val != null && val !== "") {
                return val;
            }
        }
    }
    return undefined;
}

function firstForwardedValue(raw: string | undefined): string | undefined {
    if (!raw) {
        return undefined;
    }
    const first = raw.split(",")[0]?.trim();
    return first && first.length > 0 ? first : undefined;
}

function isPlausibleIp(value: string): boolean {
    return value.length > 0 && value.length <= 45 && isIP(value) !== 0;
}

export function isExplicitTrustProxy(env: NodeJS.ProcessEnv = process.env): boolean {
    const raw = (env.GROWCAST_TRUST_PROXY ?? "").trim().toLowerCase();
    return raw === "1" || raw === "true";
}

/** Forwarded client IPs are trusted only when GROWCAST_TRUST_PROXY is set. */
export function extractClientIp(
    headers: Headers | Record<string, string | string[] | undefined>,
    env: NodeJS.ProcessEnv = process.env,
): string | undefined {
    if (!isExplicitTrustProxy(env)) {
        return undefined;
    }

    const cf = headerGet(headers, "cf-connecting-ip")?.trim();
    if (cf && isPlausibleIp(cf)) {
        return cf;
    }

    const realIp = headerGet(headers, "x-real-ip")?.trim();
    if (realIp && isPlausibleIp(realIp)) {
        return realIp;
    }

    return undefined;
}

export function clientIdentityKey(
    headers: Headers | Record<string, string | string[] | undefined>,
    env: NodeJS.ProcessEnv = process.env,
): string {
    return extractClientIp(headers, env) ?? "unknown";
}

export function loginRateLimitKey(
    headers: Headers | Record<string, string | string[] | undefined>,
    env: NodeJS.ProcessEnv = process.env,
): string {
    return `admin-login:${clientIdentityKey(headers, env)}`;
}

export function shouldUseSecureCookie(
    headers: Headers | Record<string, string | string[] | undefined>,
    env: NodeJS.ProcessEnv = process.env,
): boolean {
    const flag = (env.COOKIE_SECURE ?? "").trim().toLowerCase();
    if (flag === "1" || flag === "true") {
        return true;
    }
    if (flag === "0" || flag === "false") {
        return false;
    }

    const proto = firstForwardedValue(headerGet(headers, "x-forwarded-proto"))?.toLowerCase();
    if (proto === "https") {
        return true;
    }

    const cf = headerGet(headers, "cf-connecting-ip")?.trim();
    return Boolean(cf && isPlausibleIp(cf));
}

function isListenHostname(hostname: string): boolean {
    const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return host === "0.0.0.0" || host === "::";
}

function originFromProtoHost(proto: string, host: string): string {
    return new URL(`${proto}://${host}`).origin;
}

export function publicRequestOrigin(
    request: Request,
    env: NodeJS.ProcessEnv = process.env,
): string {
    const configured = (env.GROWCAST_PUBLIC_URL ?? "").trim();
    if (configured) {
        try {
            return new URL(configured).origin;
        } catch {
            // Fall through to request headers.
        }
    }

    const headers = request.headers;
    let url: URL;
    try {
        url = new URL(request.url);
    } catch {
        url = new URL("http://127.0.0.1");
    }

    const protoHeader = firstForwardedValue(headerGet(headers, "x-forwarded-proto"))?.toLowerCase();
    const proto =
        protoHeader === "https" || protoHeader === "http"
            ? protoHeader
            : url.protocol.replace(":", "") || "http";

    const hostHeader = firstForwardedValue(headerGet(headers, "host"));
    const forwardedHost = firstForwardedValue(headerGet(headers, "x-forwarded-host"));

    const pickPublicHost = (value: string | undefined): string | undefined => {
        if (!value) {
            return undefined;
        }
        try {
            const parsed = new URL(`http://${value}`);
            if (isListenHostname(parsed.hostname)) {
                return undefined;
            }
            return value;
        } catch {
            return undefined;
        }
    };

    const host =
        pickPublicHost(hostHeader) ||
        pickPublicHost(forwardedHost) ||
        hostHeader ||
        forwardedHost ||
        url.host;

    return originFromProtoHost(proto, host);
}

export function publicAbsoluteUrl(request: Request, path: string): string {
    return new URL(path, `${publicRequestOrigin(request)}/`).toString();
}
