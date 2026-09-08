export const DEFAULT_WAVE_SMOOTH_PCT = 70;
export const WAVE_SMOOTH_MIN = 0;
export const WAVE_SMOOTH_MAX = 100;
export const WAVE_SMOOTH_STEP = 5;
export const WAVE_SMOOTH_TIME_CONSTANT_MAX = 0.95;

export type ProgramMusicWaveKind = "url" | "playlist" | "silence";

export function programMusicWaveActive(input: {
    kind: ProgramMusicWaveKind;
    paused: boolean;
    src: string;
}): boolean {
    return input.kind === "playlist" && !input.paused && input.src.trim().length > 0;
}

export function nextPlaylistIndex(index: number, length: number): number {
    if (length <= 0) {
        return 0;
    }
    return (index + 1) % length;
}

export function pickPlaylistStartIndex(length: number, random: () => number = Math.random): number {
    if (length <= 0) {
        return 0;
    }
    return Math.min(length - 1, Math.floor(random() * length));
}

export function shouldAttachMediaElementSource(state: string): boolean {
    return state === "running";
}

export type ProgramAudioMediaErrorAction = "retry" | "next" | "url_fallback" | "silence";

export function programAudioMediaErrorAction(input: {
    kind: ProgramMusicWaveKind;
    filesLength: number;
    retries: number;
}): ProgramAudioMediaErrorAction {
    if (input.kind === "url") {
        return input.filesLength > 0 ? "url_fallback" : "silence";
    }
    if (input.kind !== "playlist") {
        return "silence";
    }
    if (input.retries < 1) {
        return "retry";
    }
    if (input.filesLength > 1) {
        return "next";
    }
    return "retry";
}

export function parseWaveSmoothPct(value: unknown): number {
    if (value === undefined || value === null || value === "") {
        return DEFAULT_WAVE_SMOOTH_PCT;
    }
    const n = typeof value === "number" ? value : Number(String(value).trim());
    if (!Number.isFinite(n)) {
        return DEFAULT_WAVE_SMOOTH_PCT;
    }
    const clamped = Math.min(WAVE_SMOOTH_MAX, Math.max(WAVE_SMOOTH_MIN, n));
    return Math.round(clamped / WAVE_SMOOTH_STEP) * WAVE_SMOOTH_STEP;
}

export function waveSmoothTimeConstant(pct: number): number {
    return Math.min(WAVE_SMOOTH_TIME_CONSTANT_MAX, parseWaveSmoothPct(pct) / 100);
}

export type MusicLook = "wave" | "player";
export const DEFAULT_MUSIC_LOOK: MusicLook = "player";
export const DEFAULT_WAVE_BARS = 24;
export const WAVE_BARS_MIN = 8;
export const WAVE_BARS_MAX = 48;
export const WAVE_BARS_STEP = 4;

export function parseMusicLook(value: unknown): MusicLook {
    return value === "wave" ? "wave" : DEFAULT_MUSIC_LOOK;
}

export function parseWaveBars(value: unknown): number {
    if (value === undefined || value === null || value === "") {
        return DEFAULT_WAVE_BARS;
    }
    const n = typeof value === "number" ? value : Number(String(value).trim());
    if (!Number.isFinite(n)) {
        return DEFAULT_WAVE_BARS;
    }
    const clamped = Math.min(WAVE_BARS_MAX, Math.max(WAVE_BARS_MIN, n));
    return Math.round(clamped / WAVE_BARS_STEP) * WAVE_BARS_STEP;
}

export function foldFrequencyBins(bins: Uint8Array, barCount: number): number[] {
    const n = parseWaveBars(barCount);
    const out = new Array<number>(n).fill(0);
    if (bins.length === 0) {
        return out;
    }
    const useful = Math.max(1, Math.floor(bins.length / 2));
    const mid = (n - 1) / 2;
    for (let i = 0; i < n; i++) {
        const dist = mid === 0 ? 0 : Math.abs(i - mid) / mid;
        const src = Math.min(useful - 1, Math.floor(dist * useful));
        out[i] = bins[src] ?? 0;
    }
    return out;
}

export function playlistTrackTitle(filename: string): string {
    const base = filename.replace(/^.*[/\\]/, "");
    const noExt = base.replace(/\.(mp3|ogg|wav|m4a)$/i, "");
    return noExt.replace(/^\d+\s*[.\-]\s*/, "").trim();
}
