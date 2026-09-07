"use client";

import {useEffect, useRef} from "react";
import OverlayMotionItem from "@/components/overlay-motion-item";
import {OVERLAY_PANEL_CLASS} from "@/components/overlay-shell";
import {useProgramAudioGraph} from "@/components/program-audio-graph";
import type {OverlayLayout} from "@/lib/overlay-layout";
import {OVERLAY_ORDER_MUSIC} from "@/lib/overlay-motion";

function drawMirroredWave(canvas: HTMLCanvasElement, bins: Uint8Array): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        return;
    }
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    const mid = height / 2;
    const count = bins.length;
    if (count < 2) {
        return;
    }
    ctx.beginPath();
    ctx.moveTo(0, mid);
    for (let i = 0; i < count; i++) {
        const x = (i / (count - 1)) * width;
        const mag = (bins[i] / 255) * mid;
        ctx.lineTo(x, mid - mag);
    }
    for (let i = count - 1; i >= 0; i--) {
        const x = (i / (count - 1)) * width;
        const mag = (bins[i] / 255) * mid;
        ctx.lineTo(x, mid + mag);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(74, 222, 128, 0.55)";
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();
}

export default function OverlayMusicWave({layout}: {layout: OverlayLayout}) {
    const {active, analyser} = useProgramAudioGraph();
    const canvasRef = useRef<HTMLCanvasElement>(null);

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
                drawMirroredWave(canvas, bins);
            }
            frame = window.requestAnimationFrame(tick);
        }
        frame = window.requestAnimationFrame(tick);
        return () => window.cancelAnimationFrame(frame);
    }, [active, analyser]);

    return (
        <OverlayMotionItem show={active} order={OVERLAY_ORDER_MUSIC} layout={layout}>
            <section className={OVERLAY_PANEL_CLASS}>
                <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">Music</p>
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
