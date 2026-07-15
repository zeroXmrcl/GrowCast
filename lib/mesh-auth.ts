import {timingSafeEqual} from "node:crypto";

const MESH_TOKEN_ENV = "GROWCAST_MESH_TOKEN";

function getMeshToken(): string | undefined {
    const token = process.env[MESH_TOKEN_ENV]?.trim();

    return token && token.length > 0 ? token : undefined;
}

function getBearerToken(request: Request): string | undefined {
    const authorization = request.headers.get("authorization");

    if (!authorization) {
        return undefined;
    }

    const match = authorization.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1]?.trim();

    return token && token.length > 0 ? token : undefined;
}

function safeEqualText(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    if (leftBuffer.length !== rightBuffer.length) {
        return false;
    }

    return timingSafeEqual(leftBuffer, rightBuffer);
}

export function requireMeshAuth(request: Request): Response | null {
    const expectedToken = getMeshToken();

    if (!expectedToken) {
        return null;
    }

    const providedToken = getBearerToken(request);

    if (providedToken && safeEqualText(providedToken, expectedToken)) {
        return null;
    }

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
