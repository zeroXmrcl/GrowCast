import {safeEqualText} from "@/lib/crypto-equal";

export const RESTREAM_TOKEN_ENV = "GROWCAST_RESTREAM_TOKEN";
export const RESTREAM_STREAM_URL_ENV = "GROWCAST_RESTREAM_STREAM_URL";

export function getRestreamTokenFromEnv(
    env: NodeJS.ProcessEnv = process.env,
): string | undefined {
    const token = env[RESTREAM_TOKEN_ENV]?.trim();
    return token && token.length > 0 ? token : undefined;
}

export function isRestreamCaptureAuthorized(
    expectedToken: string | undefined,
    providedToken: string | undefined,
): boolean {
    if (!expectedToken || !providedToken) {
        return false;
    }
    return safeEqualText(expectedToken, providedToken);
}

export function captureStreamUrl(
    streamUrl: string,
    env: NodeJS.ProcessEnv = process.env,
): string {
    const override = env[RESTREAM_STREAM_URL_ENV]?.trim();
    return override && override.length > 0 ? override : streamUrl;
}
