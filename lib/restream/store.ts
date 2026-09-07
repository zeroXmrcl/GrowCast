import {chmod, readFile} from "node:fs/promises";
import {asBoolean, asString, isRecord} from "@/lib/coerce";
import {atomicWriteFile} from "@/lib/atomic-file";
import {
    publicBroadcastPayload,
    type PublicBroadcast,
} from "@/lib/restream/broadcast";
import {
    restreamChannelFile,
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

export type RestreamChannel = {
    login: string;
    toastEnabled: boolean;
};

export type RestreamPublicView = {
    hasKey: boolean;
    enabled: boolean;
    status: RestreamStatus;
    login: string;
    toastEnabled: boolean;
};

const STATES = new Set<RestreamState>([
    "off",
    "starting",
    "live",
    "reconnecting",
    "error",
]);

export const EMPTY_RESTREAM_CHANNEL: RestreamChannel = {
    login: "",
    toastEnabled: false,
};

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

export function parseRestreamChannel(raw: unknown): RestreamChannel {
    if (!isRecord(raw)) {
        return EMPTY_RESTREAM_CHANNEL;
    }
    return {
        login: asString(raw.login).trim(),
        toastEnabled: asBoolean(raw.toastEnabled, false),
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

export async function readRestreamKey(): Promise<string> {
    try {
        return (await readFile(restreamKeyFile(), "utf8")).trim();
    } catch {
        return "";
    }
}

export async function hasRestreamKey(): Promise<boolean> {
    return (await readRestreamKey()).length > 0;
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

export async function readRestreamChannel(): Promise<RestreamChannel> {
    return parseRestreamChannel(await readJson(restreamChannelFile()));
}

export async function writeRestreamChannel(channel: RestreamChannel): Promise<void> {
    const next: RestreamChannel = {
        login: channel.login.trim(),
        toastEnabled: channel.toastEnabled === true,
    };
    await atomicWriteFile(restreamChannelFile(), `${JSON.stringify(next, null, 2)}\n`);
    await chmod(restreamChannelFile(), 0o600);
}

export async function patchRestreamChannel(
    patch: Partial<RestreamChannel>,
): Promise<RestreamChannel> {
    const current = await readRestreamChannel();
    const next: RestreamChannel = {
        login: patch.login !== undefined ? patch.login : current.login,
        toastEnabled: patch.toastEnabled !== undefined ? patch.toastEnabled : current.toastEnabled,
    };
    await writeRestreamChannel(next);
    return next;
}

export async function readRestreamPublicView(): Promise<RestreamPublicView> {
    const [control, status, key, channel] = await Promise.all([
        readRestreamControl(),
        readRestreamStatus(),
        hasRestreamKey(),
        readRestreamChannel(),
    ]);
    return {
        hasKey: key,
        enabled: control.enabled,
        status: displayRestreamStatus(control, status, Date.now()),
        login: channel.login,
        toastEnabled: channel.toastEnabled,
    };
}

export async function readPublicBroadcast(): Promise<PublicBroadcast> {
    const [control, status, channel] = await Promise.all([
        readRestreamControl(),
        readRestreamStatus(),
        readRestreamChannel(),
    ]);
    const displayed = displayRestreamStatus(control, status, Date.now());
    return publicBroadcastPayload({
        displayState: displayed.state,
        toastEnabled: channel.toastEnabled,
        login: channel.login,
    });
}

export async function broadcastGetResponse(): Promise<Response> {
    try {
        const body = await readPublicBroadcast();
        return Response.json(body, {
            headers: {"Cache-Control": "no-store, must-revalidate"},
        });
    } catch {
        return Response.json(
            {live: false},
            {headers: {"Cache-Control": "no-store, must-revalidate"}},
        );
    }
}
