import type {LiveDeviceTile} from "@/lib/live-climate-view";

export const LIVE_DEVICE_ROW_CLASS =
    "flex flex-wrap justify-center gap-4 lg:flex-nowrap lg:gap-0";

export const LIVE_DEVICE_VOID_CLASS =
    "pointer-events-none hidden min-h-0 min-w-0 w-4 max-w-4 basis-4 shrink-[100] grow-0 lg:block";

export const LIVE_DEVICE_ITEM_CLASS =
    "min-w-0 w-[4.75rem] max-w-[4.75rem] basis-[4.75rem] shrink grow-0";

export type LiveDeviceRowItem =
    | {kind: "void"; key: string}
    | {kind: "tile"; key: string; tile: LiveDeviceTile};

export function liveDeviceRowItems(tiles: LiveDeviceTile[]): LiveDeviceRowItem[] {
    const items: LiveDeviceRowItem[] = [];
    for (const tile of tiles) {
        if (items.length > 0) {
            items.push({kind: "void", key: `void-${tile.id}`});
        }
        items.push({kind: "tile", key: tile.id, tile});
    }
    return items;
}
