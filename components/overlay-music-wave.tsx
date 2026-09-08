"use client";

import {useEffect, useRef} from "react";
import OverlayMotionItem from "@/components/overlay-motion-item";
import {OVERLAY_PANEL_CLASS} from "@/components/overlay-shell";
import {useProgramAudioGraph} from "@/components/program-audio-graph";
import type {OverlayLayout} from "@/lib/overlay-layout";
import {OVERLAY_ORDER_MUSIC} from "@/lib/overlay-motion";
import {DEFAULT_MUSIC_LOOK, DEFAULT_WAVE_BARS, foldFrequencyBins} from "@/lib/program-music-wave";

function formatClock(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) {
        return "0:00";
    }
    const total = Math.floor(seconds);
    const m = Math.floor(total / 60);
    const r = total % 60;
    return `${m}:${r.toString().padStart(2, "0")}`;
}

function drawMirroredWave(canvas: HTMLCanvasElement, values: number[]): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        return;
    }
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    const mid = height / 2;
    const count = values.length;
    if (count < 2) {
        return;
    }
    ctx.beginPath();
    ctx.moveTo(0, mid);
    for (let i = 0; i < count; i++) {
        const x = (i / (count - 1)) * width;
        const mag = ((values[i] ?? 0) / 255) * mid;
        ctx.lineTo(x, mid - mag);
    }
    for (let i = count - 1; i >= 0; i--) {
        const x = (i / (count - 1)) * width;
        const mag = ((values[i] ?? 0) / 255) * mid;
        ctx.lineTo(x, mid + mag);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(74, 222, 128, 0.55)";
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();
}

function drawPlayerBars(
    canvas: HTMLCanvasElement,
    values: number[],
    progress: number | null,
): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        return;
    }
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    const count = values.length;
    if (count === 0) {
        return;
    }
    const gap = 2;
    const barWidth = Math.max(1, (width - gap * (count - 1)) / count);
    const played = progress === null ? count : Math.floor(progress * count);
    for (let i = 0; i < count; i++) {
        const mag = ((values[i] ?? 0) / 255) * height;
        const x = i * (barWidth + gap);
        ctx.fillStyle = progress === null || i < played ? "#4ade80" : "rgba(161, 161, 170, 0.35)";
        ctx.fillRect(x, height - mag, barWidth, mag);
    }
    if (progress !== null) {
        const tickX = Math.min(width - 2, Math.max(0, progress * width));
        ctx.fillStyle = "#fafafa";
        ctx.fillRect(tickX, 0, 2, height);
    }
}

export default function OverlayMusicWave({layout}: {layout: OverlayLayout}) {
    const {active, analyser, title, currentTime, duration, musicLook, waveBars} = useProgramAudioGraph();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const lookRef = useRef(musicLook);
    const barsRef = useRef(waveBars);
    const timeRef = useRef({currentTime, duration});
    lookRef.current = musicLook;
    barsRef.current = waveBars;
    timeRef.current = {currentTime, duration};

    useEffect(() => {
        if (!active || !analyser) {
            return;
        }
        const bins = new Uint8Array(analyser.frequencyBinCount);
        let frame = 0;
        function tick() {
            const canvas = canvasRef.current;
            if (canvas && analyser) {
                analyser.getByteFrequencyData(bins);
                const folded = foldFrequencyBins(bins, barsRef.current ?? DEFAULT_WAVE_BARS);
                if ((lookRef.current ?? DEFAULT_MUSIC_LOOK) === "wave") {
                    drawMirroredWave(canvas, folded);
                } else {
                    const {currentTime: t, duration: d} = timeRef.current;
                    const progress = d > 0 ? Math.min(1, Math.max(0, t / d)) : null;
                    drawPlayerBars(canvas, folded, progress);
                }
            }
            frame = window.requestAnimationFrame(tick);
        }
        frame = window.requestAnimationFrame(tick);
        return () => window.cancelAnimationFrame(frame);
    }, [active, analyser]);

    return (
        <OverlayMotionItem show={active} order={OVERLAY_ORDER_MUSIC} layout={layout}>
            <section className={OVERLAY_PANEL_CLASS}>
                {musicLook === "wave" ? (
                    <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">Music</p>
                ) : null}
                {musicLook === "player" && title ? (
                    <p className="truncate text-sm font-semibold tracking-tight text-zinc-50">{title}</p>
                ) : null}
                {musicLook === "player" && duration > 0 ? (
                    <p className="mt-1 text-xs tabular-nums text-zinc-300">
                        {formatClock(currentTime)} / {formatClock(duration)}
                    </p>
                ) : null}
                <canvas
                    ref={canvasRef}
                    width={280}
                    height={56}
                    className="mt-1 h-14 w-full"
                    aria-hidden="true"
                />
            </section>
        </OverlayMotionItem>
    );
}
