"use client";

import Hls from "hls.js";
import {useEffect, useRef, useState} from "react";
import {
    COVER_FADE_MS,
    COVER_MIN_MS,
    coverShouldHide,
    hlsPlaylistUrl,
} from "@/lib/overlay-hls";
import {
    EMPTY_CAMERA_LOOK,
    cameraLookFilterCss,
    cameraLookTemperatureStyle,
    type CameraLook,
} from "@/lib/restream/camera-look";

const RETRY_MS = 2000;
const CLOCK_MS = 250;

export default function OverlayCamera({
    streamUrl,
    look = EMPTY_CAMERA_LOOK,
    title = "Grow stream",
}: {
    streamUrl: string;
    look?: CameraLook;
    title?: string;
}) {
    const playlist = hlsPlaylistUrl(streamUrl);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [fatal, setFatal] = useState(false);
    const [playing, setPlaying] = useState(false);
    const [hasFrame, setHasFrame] = useState(false);
    const [shownAtMs, setShownAtMs] = useState<number | null>(null);
    const [nowMs, setNowMs] = useState(() => Date.now());
    const hide = coverShouldHide({fatal, playing, shownAtMs, nowMs});
    const showCover = !hide;

    useEffect(() => {
        if (!hide || shownAtMs === null) {
            return;
        }
        const timer = window.setTimeout(() => {
            setShownAtMs(null);
        }, 0);
        return () => window.clearTimeout(timer);
    }, [hide, shownAtMs]);

    useEffect(() => {
        if (!showCover) {
            return;
        }
        const timer = window.setInterval(() => {
            setNowMs(Date.now());
        }, CLOCK_MS);
        return () => window.clearInterval(timer);
    }, [showCover]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !playlist) {
            return;
        }
        let cancelled = false;
        let hls: Hls | null = null;
        let retry: number | null = null;
        let nativeOnError: (() => void) | null = null;

        const snapshot = () => {
            const canvas = canvasRef.current;
            if (!canvas || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
                return;
            }
            const width = video.videoWidth || 1280;
            const height = video.videoHeight || 720;
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
            }
            const ctx = canvas.getContext("2d");
            if (!ctx) {
                return;
            }
            ctx.drawImage(video, 0, 0, width, height);
            setHasFrame(true);
        };

        const markPlaying = () => {
            const ready = video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
            setPlaying(ready && !video.paused);
            if (ready) {
                setFatal(false);
                snapshot();
            }
        };

        const fail = () => {
            if (!cancelled) {
                setFatal(true);
                setPlaying(false);
                setShownAtMs((prev) => prev ?? Date.now());
            }
        };

        const attach = () => {
            if (cancelled) {
                return;
            }
            if (Hls.isSupported()) {
                hls = new Hls({enableWorker: true});
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    void video.play().catch(() => undefined);
                });
                hls.on(Hls.Events.ERROR, (_event, data) => {
                    if (data.fatal) {
                        hls?.destroy();
                        hls = null;
                        fail();
                        retry = window.setTimeout(attach, RETRY_MS);
                    }
                });
                hls.loadSource(playlist);
                return;
            }
            video.src = playlist;
            nativeOnError = () => {
                fail();
                retry = window.setTimeout(() => {
                    video.src = playlist;
                    void video.play().catch(() => undefined);
                }, RETRY_MS);
            };
            video.addEventListener("error", nativeOnError);
        };

        video.addEventListener("playing", markPlaying);
        video.addEventListener("pause", markPlaying);
        video.addEventListener("waiting", markPlaying);
        video.addEventListener("timeupdate", snapshot);
        attach();
        void video.play().catch(() => undefined);

        return () => {
            cancelled = true;
            if (retry !== null) {
                window.clearTimeout(retry);
            }
            video.removeEventListener("playing", markPlaying);
            video.removeEventListener("pause", markPlaying);
            video.removeEventListener("waiting", markPlaying);
            video.removeEventListener("timeupdate", snapshot);
            if (nativeOnError) {
                video.removeEventListener("error", nativeOnError);
            }
            hls?.destroy();
            video.removeAttribute("src");
            video.load();
        };
    }, [playlist]);

    if (!playlist) {
        return null;
    }

    const filter = cameraLookFilterCss(look);

    return (
        <div className="relative h-full w-full overflow-hidden bg-zinc-950">
            <div className="absolute inset-0" style={{filter: filter || undefined}}>
                <video
                    ref={videoRef}
                    className="absolute inset-0 h-full w-full object-cover"
                    autoPlay
                    muted
                    playsInline
                    title={title}
                />
                <canvas
                    ref={canvasRef}
                    className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                    style={{
                        opacity: showCover && hasFrame ? 1 : 0,
                        filter: "blur(14px)",
                        transform: "scale(1.06)",
                    }}
                    aria-hidden="true"
                />
                <div
                    className="pointer-events-none absolute inset-0 bg-zinc-950"
                    style={{opacity: showCover && !hasFrame ? 1 : 0}}
                    aria-hidden="true"
                />
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0"
                    style={cameraLookTemperatureStyle(look.temperature)}
                />
            </div>
            <div
                className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3"
                data-cover-min={COVER_MIN_MS}
                style={{
                    background: "rgba(9, 9, 11, 0.42)",
                    opacity: showCover ? 1 : 0,
                    transitionProperty: "opacity",
                    transitionDuration: `${COVER_FADE_MS}ms`,
                }}
                aria-hidden={!showCover}
            >
                <div
                    className="flex items-center gap-3"
                    style={{
                        filter:
                            "drop-shadow(0 1px 2px rgba(0,0,0,0.95)) drop-shadow(0 0 10px rgba(0,0,0,0.8))",
                    }}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/growCastLogo_green.svg" alt="" width={56} height={56} />
                    <span className="text-[36px] font-semibold tracking-tight text-zinc-50">GrowCast</span>
                </div>
                <p className="growcast-cover-breathe text-xs font-medium uppercase tracking-[0.16em] text-zinc-300">Reconnecting</p>
            </div>
        </div>
    );
}
