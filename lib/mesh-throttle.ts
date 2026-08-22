import {requireMeshAuth} from "@/lib/mesh-auth";
import {clientIdentityKey} from "@/lib/request-trust";

export const MESH_AUTH_MAX_FAILURES = 8;
export const MESH_AUTH_BLOCK_MS = 60_000;

type FailureBucket = {
    count: number;
    blockedUntil: number;
};

const failures = new Map<string, FailureBucket>();

export function meshClientKey(request: Request): string {
    return clientIdentityKey(request.headers);
}

export function noteMeshAuthFailure(
    key: string,
    nowMs: number = Date.now(),
): {blocked: boolean; retryAfterSeconds: number} {
    const existing = failures.get(key);
    if (existing && existing.blockedUntil > nowMs) {
        return {
            blocked: true,
            retryAfterSeconds: Math.max(1, Math.ceil((existing.blockedUntil - nowMs) / 1000)),
        };
    }

    const count = (existing && existing.blockedUntil === 0 ? existing.count : 0) + 1;
    if (count >= MESH_AUTH_MAX_FAILURES) {
        failures.set(key, {count, blockedUntil: nowMs + MESH_AUTH_BLOCK_MS});
        return {blocked: true, retryAfterSeconds: Math.ceil(MESH_AUTH_BLOCK_MS / 1000)};
    }

    failures.set(key, {count, blockedUntil: 0});
    return {blocked: false, retryAfterSeconds: 0};
}

export function clearMeshAuthFailures(key: string): void {
    failures.delete(key);
}

/**
 * Fail-closed mesh Bearer check with the shared per-identity failure throttle.
 * Returns null when authorized; 401 or 429 otherwise.
 */
export function requireMeshAuthThrottled(request: Request): Response | null {
    const clientKey = meshClientKey(request);
    const auth = requireMeshAuth(request);
    if (auth) {
        const limited = noteMeshAuthFailure(clientKey);
        if (limited.blocked) {
            return new Response(null, {
                status: 429,
                headers: {
                    "Cache-Control": "no-store",
                    "Retry-After": String(limited.retryAfterSeconds),
                },
            });
        }
        return auth;
    }
    clearMeshAuthFailures(clientKey);
    return null;
}

export function _resetMeshAuthThrottleForTests(): void {
    failures.clear();
}
