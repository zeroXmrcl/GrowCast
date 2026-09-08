"use client";

import {useEffect, useRef, useState} from "react";
import {PROGRAM_HEIGHT, PROGRAM_WIDTH, programScale} from "@/lib/program-monitor";
import {
    CAMERA_LOOK_DRAFT_EVENT,
    CAMERA_LOOK_MESSAGE_TYPE,
    parseCameraLook,
    type CameraLook,
} from "@/lib/restream/camera-look";

function postCameraLook(iframe: HTMLIFrameElement | null, look: CameraLook): void {
    iframe?.contentWindow?.postMessage(
        {type: CAMERA_LOOK_MESSAGE_TYPE, ...look},
        window.location.origin,
    );
}

export function ProgramMonitor() {
    const boxRef = useRef<HTMLDivElement>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const draftRef = useRef<CameraLook | null>(null);
    const [scale, setScale] = useState(0);

    useEffect(() => {
        const box = boxRef.current;
        if (box === null) {
            return;
        }

        function update() {
            const node = boxRef.current;
            if (node === null) {
                return;
            }
            setScale(programScale(node.clientWidth, node.clientHeight));
        }

        update();
        const observer = new ResizeObserver(update);
        observer.observe(box);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        function unlockPreviewAudio() {
            const audio = iframeRef.current?.contentDocument?.querySelector("audio");
            if (audio) {
                void audio.play().catch(() => undefined);
            }
        }
        window.addEventListener("pointerdown", unlockPreviewAudio);
        window.addEventListener("keydown", unlockPreviewAudio);
        return () => {
            window.removeEventListener("pointerdown", unlockPreviewAudio);
            window.removeEventListener("keydown", unlockPreviewAudio);
        };
    }, []);

    useEffect(() => {
        function onDraft(event: Event) {
            const look = parseCameraLook((event as CustomEvent).detail);
            draftRef.current = look;
            postCameraLook(iframeRef.current, look);
        }
        window.addEventListener(CAMERA_LOOK_DRAFT_EVENT, onDraft);
        return () => window.removeEventListener(CAMERA_LOOK_DRAFT_EVENT, onDraft);
    }, []);

    return (
        <div
            ref={boxRef}
            className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-md border border-(--admin-border) bg-black"
        >
            <div
                className="overflow-hidden"
                style={{
                    width: PROGRAM_WIDTH * scale,
                    height: PROGRAM_HEIGHT * scale,
                }}
            >
                <iframe
                    ref={iframeRef}
                    src="/program"
                    width={1920}
                    height={1080}
                    allow="autoplay"
                    title="Program"
                    className="block border-0"
                    onLoad={() => {
                        if (draftRef.current) {
                            postCameraLook(iframeRef.current, draftRef.current);
                        }
                    }}
                    style={{
                        transform: `scale(${scale})`,
                        transformOrigin: "top left",
                    }}
                />
            </div>
        </div>
    );
}
