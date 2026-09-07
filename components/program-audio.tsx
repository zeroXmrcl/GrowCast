"use client";

import {useEffect, useRef, useState} from "react";

const PROGRAM_AUDIO_POLL_MS = 2000;
const PROGRAM_AUDIO_PATH = "/api/overlay/program-audio";

type AudioKind = "url" | "playlist" | "silence";

type ProgramAudioBody = {
    kind: AudioKind;
    url: string;
    files: string[];
    volume: number;
    paused: boolean;
};

function isAudioKind(value: unknown): value is AudioKind {
    return value === "url" || value === "playlist" || value === "silence";
}

function parseProgramAudioBody(raw: unknown): ProgramAudioBody | null {
    if (raw === null || typeof raw !== "object") {
        return null;
    }
    const body = raw as Record<string, unknown>;
    if (!isAudioKind(body.kind) || typeof body.url !== "string") {
        return null;
    }
    if (!Array.isArray(body.files) || body.files.some((name) => typeof name !== "string")) {
        return null;
    }
    if (typeof body.volume !== "number" || !Number.isFinite(body.volume)) {
        return null;
    }
    if (typeof body.paused !== "boolean") {
        return null;
    }
    return {
        kind: body.kind,
        url: body.url,
        files: body.files,
        volume: Math.min(1, Math.max(0, body.volume)),
        paused: body.paused,
    };
}

function playlistFileSrc(filename: string, captureToken: string | undefined): string {
    const path = `/api/overlay/music/${encodeURIComponent(filename)}`;
    if (captureToken) {
        return `${path}?token=${encodeURIComponent(captureToken)}`;
    }
    return path;
}

function playbackKind(
    body: ProgramAudioBody | null,
    urlFailed: boolean,
    playbackFailed: boolean,
): AudioKind {
    if (!body || playbackFailed) {
        return "silence";
    }
    if (body.kind === "url" && urlFailed) {
        return body.files.length > 0 ? "playlist" : "silence";
    }
    return body.kind;
}

function sourceKeyOf(body: ProgramAudioBody | null): string {
    if (!body) {
        return "";
    }
    return `${body.kind}\0${body.url}\0${body.files.join("\0")}`;
}

function resolveElementSrc(
    kind: AudioKind,
    body: ProgramAudioBody | null,
    captureToken: string | undefined,
    playlistIndex: number,
): string {
    if (!body || kind === "silence") {
        return "";
    }
    if (kind === "url") {
        return body.url;
    }
    if (body.files.length === 0) {
        return "";
    }
    const file = body.files[playlistIndex % body.files.length];
    if (!file) {
        return "";
    }
    return playlistFileSrc(file, captureToken);
}

export default function ProgramAudio({captureToken}: {captureToken?: string}) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const sourceKeyRef = useRef("");
    const [body, setBody] = useState<ProgramAudioBody | null>(null);
    const [playlistIndex, setPlaylistIndex] = useState(0);
    const [urlFailed, setUrlFailed] = useState(false);
    const [playbackFailed, setPlaybackFailed] = useState(false);
    const kind = playbackKind(body, urlFailed, playbackFailed);
    const src = resolveElementSrc(kind, body, captureToken, playlistIndex);
    const singleFilePlaylist = kind === "playlist" && (body?.files.length ?? 0) === 1;

    useEffect(() => {
        const abort = new AbortController();
        let cancelled = false;

        async function poll() {
            try {
                const headers: HeadersInit = {};
                if (captureToken) {
                    headers["x-growcast-capture"] = captureToken;
                }
                const response = await fetch(PROGRAM_AUDIO_PATH, {
                    credentials: "include",
                    cache: "no-store",
                    headers,
                    signal: abort.signal,
                });
                if (!response.ok || cancelled) {
                    return;
                }
                const parsed = parseProgramAudioBody(await response.json());
                if (!parsed || cancelled) {
                    return;
                }
                const nextKey = sourceKeyOf(parsed);
                if (sourceKeyRef.current !== nextKey) {
                    sourceKeyRef.current = nextKey;
                    setUrlFailed(false);
                    setPlaybackFailed(false);
                    setPlaylistIndex(0);
                }
                setBody(parsed);
            } catch {
                // next interval retries
            }
        }

        void poll();
        const timer = setInterval(() => {
            void poll();
        }, PROGRAM_AUDIO_POLL_MS);

        return () => {
            cancelled = true;
            abort.abort();
            clearInterval(timer);
        };
    }, [captureToken]);

    useEffect(() => {
        const el = audioRef.current;
        if (!el) {
            return;
        }
        el.volume = body?.volume ?? 0;
        if (!src) {
            el.removeAttribute("src");
            el.load();
            el.pause();
            return;
        }
        if (el.getAttribute("src") !== src) {
            el.src = src;
        }
        if (body?.paused) {
            el.pause();
            return;
        }
        void el.play().catch(() => undefined);
    }, [src, body?.paused, body?.volume]);

    return (
        <audio
            ref={audioRef}
            hidden
            referrerPolicy="no-referrer"
            src={src || undefined}
            loop={singleFilePlaylist}
            onError={() => {
                if (!src || !body) {
                    return;
                }
                if (kind === "url" && body.files.length > 0) {
                    setUrlFailed(true);
                    return;
                }
                setPlaybackFailed(true);
            }}
            onEnded={() => {
                if (kind !== "playlist" || !body || body.files.length === 0) {
                    return;
                }
                const next = (playlistIndex + 1) % body.files.length;
                // (0+1)%1 === 0 so React skips setState; restart the same file in place.
                if (next === playlistIndex) {
                    const el = audioRef.current;
                    if (el) {
                        el.currentTime = 0;
                        if (!body.paused) {
                            void el.play().catch(() => undefined);
                        }
                    }
                    return;
                }
                setPlaylistIndex(next);
            }}
        />
    );
}
