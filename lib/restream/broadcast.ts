import {asString, isRecord} from "@/lib/coerce";

export const BROADCAST_POLL_MS = 5_000;
export const BROADCAST_POLL_PATH = "/api/data/broadcast";

export type PublicBroadcast =
    | {live: true; login: string}
    | {live: false};

export function isTwitchLogin(value: string): boolean {
    return /^[A-Za-z0-9_]+$/.test(value);
}

export function publicBroadcastPayload(input: {
    displayState: string;
    toastEnabled: boolean;
    login: string;
}): PublicBroadcast {
    const login = input.login.trim();
    if (input.displayState === "live" && input.toastEnabled && isTwitchLogin(login)) {
        return {live: true, login};
    }
    return {live: false};
}

export function parsePublicBroadcastBody(raw: unknown): PublicBroadcast {
    if (!isRecord(raw) || raw.live !== true) {
        return {live: false};
    }
    const login = asString(raw.login).trim();
    if (!isTwitchLogin(login)) {
        return {live: false};
    }
    return {live: true, login};
}
