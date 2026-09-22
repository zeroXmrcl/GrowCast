import type {LiveDeviceTile} from "@/lib/live-climate-view";

export function deviceGaugePercent(
    tile: Pick<LiveDeviceTile, "running" | "alerting" | "levelText">,
): number {
    if (tile.alerting || !tile.running) {
        return 0;
    }
    const percent = /^(\d+)%$/.exec(tile.levelText);
    if (percent) {
        return Math.min(100, Number(percent[1]));
    }
    if (tile.levelText === "LOW") {
        return 50;
    }
    if (tile.levelText === "HIGH" || tile.levelText === "on") {
        return 100;
    }
    return 0;
}
