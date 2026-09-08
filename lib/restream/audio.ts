import {chmod, readFile} from "node:fs/promises";
import {asBoolean, asNumber, asString, isRecord} from "@/lib/coerce";
import {atomicWriteFile} from "@/lib/atomic-file";
import {
    parseMusicLook,
    parseWaveBars,
    parseWaveSmoothPct,
    type MusicLook,
} from "@/lib/program-music-wave";
import {normalizeOptionalHttpUrl} from "@/lib/url-policy";
import {restreamAudioFile, restreamDir} from "@/lib/restream/paths";

export type RestreamAudio = {
    url: string;
    volume: number;
    paused: boolean;
    waveSmoothPct: number;
    musicLook: MusicLook;
    waveBars: number;
};

export type AudioSourceKind = "url" | "playlist" | "silence";

export const EMPTY_RESTREAM_AUDIO: RestreamAudio = {
    url: "",
    volume: 0.7,
    paused: false,
    waveSmoothPct: 70,
    musicLook: "player",
    waveBars: 24,
};

export function parseRestreamAudio(raw: unknown): RestreamAudio {
    if (!isRecord(raw)) {
        return EMPTY_RESTREAM_AUDIO;
    }
    const url = normalizeOptionalHttpUrl(asString(raw.url)) ?? "";
    const volume = Math.min(1, Math.max(0, asNumber(raw.volume, EMPTY_RESTREAM_AUDIO.volume)));
    return {
        url,
        volume,
        paused: asBoolean(raw.paused, false),
        waveSmoothPct: parseWaveSmoothPct(raw.waveSmoothPct),
        musicLook: parseMusicLook(raw.musicLook),
        waveBars: parseWaveBars(raw.waveBars),
    };
}

export function resolveAudioSource(audio: RestreamAudio, playlistNames: string[]): AudioSourceKind {
    if (audio.url.trim().length > 0) {
        return "url";
    }
    if (playlistNames.length > 0) {
        return "playlist";
    }
    return "silence";
}

export async function readRestreamAudio(): Promise<RestreamAudio> {
    try {
        return parseRestreamAudio(JSON.parse(await readFile(restreamAudioFile(), "utf8")));
    } catch {
        return EMPTY_RESTREAM_AUDIO;
    }
}

export async function writeRestreamAudio(audio: RestreamAudio): Promise<void> {
    const parsed = parseRestreamAudio(audio);
    await atomicWriteFile(restreamAudioFile(), `${JSON.stringify(parsed, null, 2)}\n`);
    await chmod(restreamDir(), 0o700).catch(() => undefined);
    await chmod(restreamAudioFile(), 0o600);
}
