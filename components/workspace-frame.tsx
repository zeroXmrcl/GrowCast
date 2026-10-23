"use client";

import type {ReactNode} from "react";
import {useRef} from "react";
import {usePathname} from "next/navigation";
import OverlayCamera from "@/components/overlay-camera";
import {BroadcastToast} from "@/components/broadcast-toast";
import EnergyScoreboard from "@/components/energy-scoreboard";
import {useWorkspaceNav} from "@/components/workspace-nav";
import {EMPTY_CAMERA_LOOK, type CameraLook} from "@/lib/restream/camera-look";
import {isWorkspacePath, WORKSPACE_AREA, WORKSPACE_BOARD_CLASS, WORKSPACE_VT} from "@/lib/workspace";

type WorkspaceFrameProps = {
    children: ReactNode;
    streamUrl: string;
    growName: string;
    showGrowName: boolean;
    look?: CameraLook;
};

export default function WorkspaceFrame({
    children,
    streamUrl,
    growName,
    showGrowName,
    look = EMPTY_CAMERA_LOOK,
}: WorkspaceFrameProps) {
    const pathname = usePathname();
    const {view} = useWorkspaceNav();
    const dashSlot = useRef<ReactNode>(null);
    if (pathname === "/" && children) {
        dashSlot.current = children;
    }

    if (!isWorkspacePath(pathname)) {
        return children;
    }

    const energy = view === "/energy";
    const page = energy ? "energy" : showGrowName ? "dash" : "dash-noname";

    return (
        <main className="flex flex-1 flex-col py-4">
            {energy ? <h1 className="sr-only">Energy</h1> : null}
            <div className={`${WORKSPACE_BOARD_CLASS} ${WORKSPACE_VT.board}`} data-page={page}>
                {showGrowName ? (
                    <div className={`${WORKSPACE_AREA.name} ${WORKSPACE_VT.name} px-4 py-3 sm:px-6`}>
                        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                            {growName}
                        </h1>
                    </div>
                ) : null}
                <div className={`${WORKSPACE_AREA.cam} ${WORKSPACE_VT.cam} aspect-video overflow-hidden bg-zinc-900`}>
                    {streamUrl ? (
                        <OverlayCamera streamUrl={streamUrl} look={look} />
                    ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center bg-zinc-900 px-6 text-center">
                            <p className="text-base font-medium text-zinc-100">Live view unavailable</p>
                            <p className="mt-2 max-w-xs text-sm leading-6 text-zinc-400">
                                No stream is configured for this grow.
                            </p>
                        </div>
                    )}
                </div>
                <div className="growcast-dash-slot">{dashSlot.current}</div>
                <div className="growcast-energy-slot">
                    <EnergyScoreboard />
                </div>
            </div>
            {energy ? null : <BroadcastToast />}
        </main>
    );
}
