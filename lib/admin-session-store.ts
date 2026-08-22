/**
 * Next can evaluate this module once per bundle (Server Action vs Route
 * Handler). Session lookup must survive that, or /api/admin/media 303s
 * after a valid login cookie.
 */
export const ADMIN_SESSION_STORE_GLOBAL_KEY = "__growcastAdminSessionStore";
export const ADMIN_LOGIN_ATTEMPT_STORE_GLOBAL_KEY = "__growcastAdminLoginAttemptStore";

export type StoredAdminSession = {
    sid: string;
    expiresAt: number;
};

export type LoginAttemptState = {
    count: number;
    firstAttemptAt: number;
    blockedUntil: number;
};

function globalMap<K, V>(key: string): Map<K, V> {
    const g = globalThis as Record<string, unknown>;
    const existing = g[key];
    if (existing instanceof Map) {
        return existing as Map<K, V>;
    }
    const created = new Map<K, V>();
    g[key] = created;
    return created;
}

export function getAdminSessionStore(): Map<string, StoredAdminSession> {
    return globalMap(ADMIN_SESSION_STORE_GLOBAL_KEY);
}

export function getAdminLoginAttemptStore(): Map<string, LoginAttemptState> {
    return globalMap(ADMIN_LOGIN_ATTEMPT_STORE_GLOBAL_KEY);
}
