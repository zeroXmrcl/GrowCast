import {randomBytes} from "node:crypto";
import {chmod, readFile} from "node:fs/promises";
import {atomicWriteFile} from "@/lib/atomic-file";
import {safeEqualText} from "@/lib/crypto-equal";
import {restreamCaptureTokenFile} from "@/lib/restream/paths";

export const RESTREAM_TOKEN_ENV = "GROWCAST_RESTREAM_TOKEN";
export const RESTREAM_STREAM_URL_ENV = "GROWCAST_RESTREAM_STREAM_URL";

export function getRestreamTokenFromEnv(
    env: NodeJS.ProcessEnv = process.env,
): string | undefined {
    const token = env[RESTREAM_TOKEN_ENV]?.trim();
    return token && token.length > 0 ? token : undefined;
}

export async function readCaptureTokenFile(): Promise<string | undefined> {
    try {
        const token = (await readFile(restreamCaptureTokenFile(), "utf8")).trim();
        return token.length > 0 ? token : undefined;
    } catch {
        return undefined;
    }
}

export async function resolveRestreamCaptureToken(
    env: NodeJS.ProcessEnv = process.env,
): Promise<string | undefined> {
    return getRestreamTokenFromEnv(env) ?? (await readCaptureTokenFile());
}

async function writeCaptureTokenFile(token: string): Promise<void> {
    const file = restreamCaptureTokenFile();
    await atomicWriteFile(file, `${token}\n`);
    await chmod(file, 0o600);
}

export async function ensureRestreamCaptureToken(
    env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
    const fromEnv = getRestreamTokenFromEnv(env);
    if (fromEnv) {
        if ((await readCaptureTokenFile()) !== fromEnv) {
            await writeCaptureTokenFile(fromEnv);
        }
        return fromEnv;
    }
    const fromFile = await readCaptureTokenFile();
    if (fromFile) {
        return fromFile;
    }
    const token = randomBytes(32).toString("base64url");
    await writeCaptureTokenFile(token);
    return token;
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
