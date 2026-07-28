import {safeEqualText} from "@/lib/crypto-equal";

export const MESH_TOKEN_ENV = "GROWCAST_MESH_TOKEN";

/**
 * Read the expected mesh token from the environment.
 * Empty / whitespace-only is treated as unset.
 */
export function getMeshTokenFromEnv(
    env: NodeJS.ProcessEnv = process.env,
): string | undefined {
    const token = env[MESH_TOKEN_ENV]?.trim();

    return token && token.length > 0 ? token : undefined;
}

export function getBearerToken(request: Request): string | undefined {
    const authorization = request.headers.get("authorization");

    if (!authorization) {
        return undefined;
    }

    const match = authorization.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1]?.trim();

    return token && token.length > 0 ? token : undefined;
}

/**
 * Pure decision: whether a provided Bearer token is authorized for mesh.
 * Fail-closed: missing expected token always denies.
 */
export function isMeshTokenAuthorized(
    expectedToken: string | undefined,
    providedToken: string | undefined,
): boolean {
    if (!expectedToken) {
        return false;
    }

    if (!providedToken) {
        return false;
    }

    return safeEqualText(providedToken, expectedToken);
}

function unauthorizedResponse(): Response {
    return Response.json(
        {error: "Unauthorized"},
        {
            status: 401,
            headers: {
                "Cache-Control": "no-store",
                "WWW-Authenticate": 'Bearer realm="GrowCast Mesh"',
            },
        },
    );
}

/**
 * Mesh plugin API auth. Fail-closed when GROWCAST_MESH_TOKEN is unset/empty.
 * Returns a 401 Response when unauthorized; null when allowed.
 */
export function requireMeshAuth(request: Request): Response | null {
    const expectedToken = getMeshTokenFromEnv();
    const providedToken = getBearerToken(request);

    if (isMeshTokenAuthorized(expectedToken, providedToken)) {
        return null;
    }

    return unauthorizedResponse();
}
