import {randomBytes} from "node:crypto";
import {chmod, readFile} from "node:fs/promises";
import {isRecord} from "@/lib/coerce";
import {atomicWriteFile} from "@/lib/atomic-file";
import {safeEqualText} from "@/lib/crypto-equal";
import {pluginTokensFile} from "@/lib/plugins/paths";

export type PluginTokenRecord = {
    token: string;
    createdAt: string;
};

type TokenFile = {
    version: 1;
    tokens: Record<string, PluginTokenRecord>;
};

async function readTokenFile(): Promise<TokenFile> {
    try {
        const raw = JSON.parse(await readFile(pluginTokensFile(), "utf8")) as unknown;
        if (!isRecord(raw) || raw.version !== 1 || !isRecord(raw.tokens)) {
            return {version: 1, tokens: {}};
        }
        const tokens: Record<string, PluginTokenRecord> = {};
        for (const [id, value] of Object.entries(raw.tokens)) {
            if (isRecord(value) && typeof value.token === "string" && typeof value.createdAt === "string") {
                tokens[id] = {token: value.token, createdAt: value.createdAt};
            }
        }
        return {version: 1, tokens};
    } catch {
        return {version: 1, tokens: {}};
    }
}

async function writeTokenFile(file: TokenFile): Promise<void> {
    await atomicWriteFile(pluginTokensFile(), `${JSON.stringify(file, null, 2)}\n`, 0o600);
    await chmod(pluginTokensFile(), 0o600).catch(() => undefined);
}

export async function mintPluginToken(pluginId: string): Promise<string> {
    const file = await readTokenFile();
    const token = randomBytes(32).toString("base64url");
    file.tokens[pluginId] = {token, createdAt: new Date().toISOString()};
    await writeTokenFile(file);
    return token;
}

export async function revokePluginToken(pluginId: string): Promise<void> {
    const file = await readTokenFile();
    if (!(pluginId in file.tokens)) {
        return;
    }
    delete file.tokens[pluginId];
    await writeTokenFile(file);
}

export async function readPluginToken(pluginId: string): Promise<string | undefined> {
    const file = await readTokenFile();
    return file.tokens[pluginId]?.token;
}

export async function pluginHasToken(pluginId: string): Promise<boolean> {
    return Boolean(await readPluginToken(pluginId));
}

export async function isPluginTokenAuthorized(pluginId: string, provided: string | undefined): Promise<boolean> {
    const expected = await readPluginToken(pluginId);
    if (!expected || !provided) {
        return false;
    }
    return safeEqualText(expected, provided);
}
