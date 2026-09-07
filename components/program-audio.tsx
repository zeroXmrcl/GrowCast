"use client";

import {useEffect, useRef, useState} from "react";
import {useProgramAudioGraph} from "@/components/program-audio-graph";
import {
    DEFAULT_WAVE_SMOOTH_PCT,
    parseWaveSmoothPct,
    programMusicWaveActive,
    waveSmoothTimeConstant,
} from "@/lib/program-music-wave";

const PROGRAM_AUDIO_POLL_MS = 2000;
const PROGRAM_AUDIO_PATH = "/api/overlay/program-audio";
const STING_EVENT = "growcast-alert-sting";
const STING_DUCK_FACTOR = 0.25;
const STING_DUCK_MS = 1500;

type AudioKind = "url" | "playlist" | "silence";

type ProgramAudioBody = {
    kind: AudioKind;
    url: string;
    files: string[];
    volume: number;
    paused: boolean;
    stingEnabled: boolean;
    waveSmoothPct: number;
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
    if (typeof body.stingEnabled !== "boolean") {
        return null;
    }
    return {
        kind: body.kind,
        url: body.url,
        files: body.files,
        volume: Math.min(1, Math.max(0, body.volume)),
        paused: body.paused,
        stingEnabled: body.stingEnabled,
        waveSmoothPct: parseWaveSmoothPct(body.waveSmoothPct),
    };
}

function applyElementVolume(
    el: HTMLAudioElement,
    base: number,
    ducking: boolean,
): void {
    el.volume = ducking ? base * STING_DUCK_FACTOR : base;
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
    const bodyRef = useRef<ProgramAudioBody | null>(null);
    const duckTimerRef = useRef<number | null>(null);
    const graphRef = useRef<{
        context: AudioContext;
        source: MediaElementAudioSourceNode;
        analyser: AnalyserNode;
    } | null>(null);
    const {setGraph} = useProgramAudioGraph();
    const [body, setBody] = useState<ProgramAudioBody | null>(null);
    const [ducking, setDucking] = useState(false);
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
                bodyRef.current = parsed;
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
        function onSting() {
            const current = bodyRef.current;
            if (!current?.stingEnabled) {
                return;
            }
            const el = audioRef.current;
            if (el) {
                applyElementVolume(el, current.volume, true);
            }
            setDucking(true);
            if (duckTimerRef.current !== null) {
                window.clearTimeout(duckTimerRef.current);
            }
            duckTimerRef.current = window.setTimeout(() => {
                duckTimerRef.current = null;
                setDucking(false);
            }, STING_DUCK_MS);
        }

        window.addEventListener(STING_EVENT, onSting);
        return () => {
            window.removeEventListener(STING_EVENT, onSting);
            if (duckTimerRef.current !== null) {
                window.clearTimeout(duckTimerRef.current);
                duckTimerRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        const el = audioRef.current;
        if (!el) {
            return;
        }
        applyElementVolume(el, body?.volume ?? 0, ducking);
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
    }, [src, body?.paused, body?.volume, ducking]);

    useEffect(() => {
        const el = audioRef.current;
        const playing = programMusicWaveActive({kind, paused: body?.paused ?? true, src});
        if (!el || !playing) {
            setGraph({active: false, analyser: graphRef.current?.analyser ?? null});
            return;
        }
        if (!graphRef.current) {
            const context = new AudioContext();
            const source = context.createMediaElementSource(el);
            const analyser = context.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            analyser.connect(context.destination);
            graphRef.current = {context, source, analyser};
        }
        const graph = graphRef.current;
        graph.analyser.smoothingTimeConstant = waveSmoothTimeConstant(
            body?.waveSmoothPct ?? DEFAULT_WAVE_SMOOTH_PCT,
        );
        void graph.context.resume().then(() => {
            if (graph.context.state === "running") {
                setGraph({active: true, analyser: graph.analyser});
                return;
            }
            setGraph({active: false, analyser: graph.analyser});
        });
    }, [kind, src, body?.paused, body?.waveSmoothPct, setGraph]);

    return (
        <audio
            ref={audioRef}
            hidden
            // @ts-expect-error React 19 AudioHTMLAttributes omit HTML referrerPolicy.
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
