"use client";

import {useEffect, useState} from "react";
import {
    BROADCAST_POLL_MS,
    BROADCAST_POLL_PATH,
    parsePublicBroadcastBody,
    type PublicBroadcast,
} from "@/lib/restream/broadcast";

function TwitchGlitchIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="h-7 w-7 shrink-0 fill-white"
        >
            <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0 1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
        </svg>
    );
}

export function BroadcastToast() {
    const [payload, setPayload] = useState<PublicBroadcast>({live: false});

    useEffect(() => {
        let cancelled = false;

        async function tick() {
            try {
                const response = await fetch(BROADCAST_POLL_PATH, {
                    cache: "no-store",
                    headers: {Accept: "application/json"},
                });
                if (!response.ok) {
                    return;
                }
                const next = parsePublicBroadcastBody(await response.json());
                if (!cancelled) {
                    setPayload(next);
                }
            } catch {
            }
        }

        void tick();
        const id = window.setInterval(() => {
            void tick();
        }, BROADCAST_POLL_MS);
        return () => {
            cancelled = true;
            window.clearInterval(id);
        };
    }, []);

    if (!payload.live) {
        return null;
    }

    return (
        <a
            href={`https://twitch.tv/${payload.login}`}
            target="_blank"
            rel="noopener noreferrer"
            className="fixed right-4 bottom-4 z-40 flex items-center gap-3 rounded-lg px-4 py-3 text-white shadow-lg"
            style={{backgroundColor: "#9146FF"}}
        >
            <TwitchGlitchIcon/>
            <span className="flex min-w-0 flex-col">
                <span className="text-sm font-semibold">Live on Twitch</span>
                <span className="text-xs text-white/90">twitch.tv/{payload.login}</span>
            </span>
        </a>
    );
}
