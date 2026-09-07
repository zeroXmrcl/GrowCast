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

function resolveElementSrc(
    body: ProgramAudioBody | null,
    captureToken: string | undefined,
    playlistIndex: number,
): string {
    if (!body || body.kind === "silence") {
        return "";
    }
    if (body.kind === "url") {
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
    const [body, setBody] = useState<ProgramAudioBody | null>(null);
    const [playlistIndex, setPlaylistIndex] = useState(0);
    const src = resolveElementSrc(body, captureToken, playlistIndex);

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
            src={src || undefined}
            onEnded={() => {
                if (body?.kind !== "playlist" || body.files.length === 0) {
                    return;
                }
                setPlaylistIndex((index) => (index + 1) % body.files.length);
            }}
        />
    );
}
