"use client";

import type {ReactNode} from "react";
import {useRef} from "react";
import {usePathname} from "next/navigation";
import OverlayCamera from "@/components/overlay-camera";
import SiteFooter from "@/components/site-footer";
import {BroadcastToast} from "@/components/broadcast-toast";
import EnergyScoreboard from "@/components/energy-scoreboard";
import {useWorkspaceNav} from "@/components/workspace-nav";
import {isWorkspacePath, WORKSPACE_AREA, WORKSPACE_BOARD_CLASS, WORKSPACE_VT} from "@/lib/workspace";

type WorkspaceFrameProps = {
    children: ReactNode;
    streamUrl: string;
    growName: string;
    showGrowName: boolean;
};

export default function WorkspaceFrame({
    children,
    streamUrl,
    growName,
    showGrowName,
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
            <div className={WORKSPACE_BOARD_CLASS} data-page={page}>
                {showGrowName ? (
                    <div className={`${WORKSPACE_AREA.name} ${WORKSPACE_VT.name} px-4 py-3`}>
                        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                            {growName}
                        </h1>
                    </div>
                ) : null}
                <div className={`${WORKSPACE_AREA.cam} ${WORKSPACE_VT.cam} aspect-video overflow-hidden bg-zinc-900`}>
                    {streamUrl ? (
                        <OverlayCamera streamUrl={streamUrl} />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center bg-zinc-800 text-zinc-100">
                            <p>No Stream configured</p>
                        </div>
                    )}
                </div>
                <div className="growcast-dash-slot">{dashSlot.current}</div>
                <div className="growcast-energy-slot">
                    <EnergyScoreboard />
                </div>
            </div>
            <SiteFooter />
            {energy ? null : <BroadcastToast />}
        </main>
    );
}
