"use client";

import {useEffect, useRef, useState, type ReactNode} from "react";
import OverlayHud from "@/components/overlay-hud";
import type {OverlayGrowView} from "@/lib/overlay-grow";
import {
    EMPTY_CAMERA_LOOK,
    PROGRAM_CAMERA_POLL_MS,
    isCameraLookMessage,
    parseCameraLook,
    type CameraLook,
} from "@/lib/restream/camera-look";

const PROGRAM_CAMERA_PATH = "/api/overlay/program-camera";

export default function ProgramCameraLook({
    captureToken,
    extra,
    ...hud
}: Omit<OverlayGrowView, "overlayStream"> & {
    lockStream?: boolean;
    extra?: ReactNode;
    captureToken?: string;
}) {
    const [look, setLook] = useState<CameraLook>(EMPTY_CAMERA_LOOK);
    const draftRef = useRef(false);
    const booth = captureToken === undefined;

    useEffect(() => {
        const abort = new AbortController();
        let cancelled = false;
        async function poll() {
            try {
                const headers: HeadersInit = {};
                if (captureToken) {
                    headers["x-growcast-capture"] = captureToken;
                }
                const response = await fetch(PROGRAM_CAMERA_PATH, {
                    credentials: "include",
                    cache: "no-store",
                    headers,
                    signal: abort.signal,
                });
                if (!response.ok || cancelled) {
                    return;
                }
                const next = parseCameraLook(await response.json());
                if (!cancelled && !draftRef.current) {
                    setLook(next);
                }
            } catch {
                // next interval retries
            }
        }
        void poll();
        const timer = window.setInterval(() => {
            void poll();
        }, PROGRAM_CAMERA_POLL_MS);
        return () => {
            cancelled = true;
            abort.abort();
            window.clearInterval(timer);
        };
    }, [captureToken]);

    useEffect(() => {
        if (!booth) {
            return;
        }
        function onMessage(event: MessageEvent) {
            if (event.origin !== window.location.origin) {
                return;
            }
            if (!isCameraLookMessage(event.data)) {
                return;
            }
            draftRef.current = true;
            setLook(parseCameraLook(event.data));
        }
        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, [booth]);

    return (
        <OverlayHud
            {...hud}
            overlayStream="include"
            look={look}
            extra={extra}
        />
    );
}
