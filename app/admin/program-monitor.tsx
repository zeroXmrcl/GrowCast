"use client";

import {useEffect, useRef, useState} from "react";
import {PROGRAM_HEIGHT, PROGRAM_WIDTH, programScale} from "@/lib/program-monitor";

export function ProgramMonitor() {
    const boxRef = useRef<HTMLDivElement>(null);
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
                    src="/program"
                    width={1920}
                    height={1080}
                    allow="autoplay"
                    title="Program"
                    className="block border-0"
                    style={{
                        transform: `scale(${scale})`,
                        transformOrigin: "top left",
                    }}
                />
            </div>
        </div>
    );
}
