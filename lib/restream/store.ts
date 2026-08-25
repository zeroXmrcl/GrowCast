import {chmod, readFile} from "node:fs/promises";
import {asBoolean, asString, isRecord} from "@/lib/coerce";
import {atomicWriteFile} from "@/lib/atomic-file";
import {
    restreamControlFile,
    restreamKeyFile,
    restreamStatusFile,
} from "@/lib/restream/paths";

export type RestreamControl = {
    enabled: boolean;
};

export type RestreamState = "off" | "starting" | "live" | "reconnecting" | "error";

export type RestreamStatus = {
    state: RestreamState;
    updatedAt: string | null;
    lastError: string;
};

export type RestreamPublicView = {
    hasKey: boolean;
    enabled: boolean;
    status: RestreamStatus;
};

const STATES = new Set<RestreamState>([
    "off",
    "starting",
    "live",
    "reconnecting",
    "error",
]);

export const EMPTY_RESTREAM_CONTROL: RestreamControl = {enabled: false};

export const EMPTY_RESTREAM_STATUS: RestreamStatus = {
    state: "off",
    updatedAt: null,
    lastError: "",
};

export const RESTREAM_STATUS_STALE_MS = 30_000;

export function redactRestreamError(text: string, key = ""): string {
    let out = text.replace(/rtmps?:\/\/\S+/gi, "[ingest]");
    const secret = key.trim();
    if (secret.length > 0) {
        out = out.split(secret).join("[key]");
    }
    return out;
}

export function displayRestreamStatus(
    control: RestreamControl,
    status: RestreamStatus,
    nowMs: number,
): RestreamStatus {
    const lastError = redactRestreamError(status.lastError);
    if (!control.enabled) {
        return {state: "off", updatedAt: status.updatedAt, lastError};
    }
    if (status.updatedAt) {
        const t = Date.parse(status.updatedAt);
        if (Number.isFinite(t) && nowMs - t >= RESTREAM_STATUS_STALE_MS) {
            return {state: "off", updatedAt: status.updatedAt, lastError};
        }
    }
    return {...status, lastError};
}

export function parseRestreamControl(raw: unknown): RestreamControl {
    if (!isRecord(raw)) {
        return EMPTY_RESTREAM_CONTROL;
    }
    return {enabled: asBoolean(raw.enabled, false)};
}

export function parseRestreamStatus(raw: unknown): RestreamStatus {
    if (!isRecord(raw)) {
        return EMPTY_RESTREAM_STATUS;
    }
    const state = asString(raw.state);
    return {
        state: STATES.has(state as RestreamState) ? (state as RestreamState) : "off",
        updatedAt: asString(raw.updatedAt) || null,
        lastError: asString(raw.lastError),
    };
}

async function readJson(filePath: string): Promise<unknown> {
    try {
        return JSON.parse(await readFile(filePath, "utf8")) as unknown;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return null;
        }
        return null;
    }
}

export async function readRestreamControl(): Promise<RestreamControl> {
    return parseRestreamControl(await readJson(restreamControlFile()));
}

export async function readRestreamStatus(): Promise<RestreamStatus> {
    return parseRestreamStatus(await readJson(restreamStatusFile()));
}

export async function hasRestreamKey(): Promise<boolean> {
    try {
        const raw = (await readFile(restreamKeyFile(), "utf8")).trim();
        return raw.length > 0;
    } catch {
        return false;
    }
}

export async function saveRestreamKey(value: string): Promise<void> {
    const next = value.trim();
    if (next.length === 0) {
        return;
    }
    await atomicWriteFile(restreamKeyFile(), `${next}\n`);
    await chmod(restreamKeyFile(), 0o600);
}

export async function setRestreamEnabled(enabled: boolean): Promise<void> {
    await atomicWriteFile(restreamControlFile(), `${JSON.stringify({enabled}, null, 2)}\n`);
}

export async function readRestreamPublicView(): Promise<RestreamPublicView> {
    const [control, status, key] = await Promise.all([
        readRestreamControl(),
        readRestreamStatus(),
        hasRestreamKey(),
    ]);
    return {
        hasKey: key,
        enabled: control.enabled,
        status: displayRestreamStatus(control, status, Date.now()),
    };
}
