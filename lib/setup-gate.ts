import {randomBytes} from "node:crypto";
import {readFileSync} from "node:fs";
import {chmod, mkdir, unlink, writeFile} from "node:fs/promises";
import path from "node:path";
import {safeEqualText} from "@/lib/crypto-equal";
import {growcastDataDir} from "@/lib/data-paths";
import {isSetupComplete} from "@/lib/setup-account";
import {compactSetupCode, SETUP_CODE_ALPHABET, SETUP_CODE_LENGTH} from "@/lib/setup-code";

export {compactSetupCode};

/** Same bar as admin login: a real scrypt account in the environment skips the wizard. */
function envAdminSkipsSetup(env: NodeJS.ProcessEnv = process.env): boolean {
    const username = env.ADMIN_USERNAME?.trim() ?? "";
    const passwordHash = (env.ADMIN_PASSWORD_HASH?.trim() ?? "").replace(/\\\$/g, "$");
    const secret = env.ADMIN_SESSION_SECRET?.trim() ?? "";
    if (!username || !passwordHash || !secret) {
        return false;
    }
    if (username === "change-me" || passwordHash === "change-me" || secret === "generate-me") {
        return false;
    }
    return secret.length >= 32 && passwordHash.startsWith("scrypt$");
}

export function setupCodePath(): string {
    return path.join(growcastDataDir(), "setup", "code");
}

export function generateSetupCode(): string {
    let raw = "";
    while (raw.length < SETUP_CODE_LENGTH) {
        const bytes = randomBytes(16);
        for (const byte of bytes) {
            if (byte >= SETUP_CODE_ALPHABET.length * Math.floor(256 / SETUP_CODE_ALPHABET.length)) {
                continue;
            }
            raw += SETUP_CODE_ALPHABET[byte % SETUP_CODE_ALPHABET.length];
            if (raw.length === SETUP_CODE_LENGTH) {
                break;
            }
        }
    }
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export function setupCodesMatch(input: string, expected: string): boolean {
    return safeEqualText(compactSetupCode(input), compactSetupCode(expected));
}

export function readSetupCode(): string | null {
    try {
        const text = readFileSync(setupCodePath(), "utf8").trim();
        return text.length > 0 ? text : null;
    } catch {
        return null;
    }
}

/** Code required until setup finishes. Null once an admin env or a finished wizard exists. */
export async function ensureSetupCode(): Promise<string | null> {
    if (envAdminSkipsSetup() || isSetupComplete()) {
        return null;
    }
    const existing = readSetupCode();
    if (existing) {
        return existing;
    }
    const code = generateSetupCode();
    const file = setupCodePath();
    await mkdir(path.dirname(file), {recursive: true});
    try {
        await writeFile(file, `${code}\n`, {encoding: "utf8", mode: 0o600, flag: "wx"});
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
            return readSetupCode();
        }
        throw error;
    }
    await chmod(file, 0o600).catch(() => undefined);
    return readSetupCode() ?? code;
}

export async function clearSetupCode(): Promise<void> {
    await unlink(setupCodePath()).catch(() => undefined);
}

export function startupSiteUrl(env: NodeJS.ProcessEnv = process.env): string {
    const configured = (env.GROWCAST_PUBLIC_URL ?? "").trim();
    if (configured) {
        try {
            return new URL(configured).origin;
        } catch {
            // Fall through to the published bind address.
        }
    }
    const bind = (env.GROWCAST_BIND ?? "127.0.0.1").trim() || "127.0.0.1";
    const host = bind === "0.0.0.0" || bind === "::" ? "127.0.0.1" : bind;
    const port = (env.GROWCAST_PORT ?? "3000").trim() || "3000";
    return `http://${host}:${port}`;
}

export function startupBanner(input: {siteUrl: string; code: string | null}): string {
    const lines = [
        "",
        "GrowCast",
        `  Open        ${input.siteUrl}`,
    ];
    if (input.code) {
        lines.push(`  Setup code  ${input.code}`);
        lines.push("  Enter that code on the setup page to create the admin account.");
        lines.push("  It stays in this log until setup is finished.");
    }
    lines.push("");
    return lines.join("\n");
}

/** Print where to open GrowCast, and the setup code while the wizard is still open. */
export async function announceStartup(env: NodeJS.ProcessEnv = process.env): Promise<void> {
    const code = await ensureSetupCode();
    process.stdout.write(startupBanner({siteUrl: startupSiteUrl(env), code}));
}
