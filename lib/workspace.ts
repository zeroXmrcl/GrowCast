import {OVERLAY_EASING_ENTER} from "@/lib/overlay-motion";

export const WORKSPACE_MORPH_MS = 360;
export const WORKSPACE_EASING = OVERLAY_EASING_ENTER;
export const WORKSPACE_CAM_ENERGY_PX = 320;

export const WORKSPACE_BOARD_CLASS =
    "growcast-board overflow-hidden border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950";

export const WORKSPACE_HAIRLINE = "border-zinc-200 dark:border-zinc-800";
export const WORKSPACE_SPLIT_B = `border-b ${WORKSPACE_HAIRLINE}`;
export const WORKSPACE_SPLIT_R = `border-r ${WORKSPACE_HAIRLINE}`;
export const WORKSPACE_SPLIT_MID = `max-lg:border-b lg:border-r ${WORKSPACE_HAIRLINE}`;
export const WORKSPACE_PAD = "p-4 sm:p-[18px]";
export const WORKSPACE_TITLE = "mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100";

export const WORKSPACE_AREA = {
    name: "growcast-area-name",
    cam: "growcast-area-cam",
    details: "growcast-area-details",
    live: "growcast-area-live",
    run: "growcast-area-run",
    pics: "growcast-area-pics",
    setup: "growcast-area-setup",
    socials: "growcast-area-socials",
    kwh: "growcast-area-kwh",
    watts: "growcast-area-watts",
    flow: "growcast-area-flow",
    water: "growcast-area-water",
    table: "growcast-area-table",
} as const;

export const WORKSPACE_VT = {
    header: "vt-header",
    cam: "vt-cam",
    name: "vt-name",
    side: "vt-side",
    mid: "vt-mid",
    flow: "vt-flow",
    water: "vt-water",
    table: "vt-table",
    socials: "vt-socials",
} as const;

export function isWorkspacePath(pathname: string): boolean {
    return pathname === "/" || pathname === "/energy";
}

export function isWorkspaceHandoff(from: string, to: string): boolean {
    return isWorkspacePath(from) && isWorkspacePath(to) && from !== to;
}
