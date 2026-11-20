export function widgetColumnSpan(size?: string): number {
    if (!size) {
        return 1;
    }
    const match = /^(\d+)x(\d+)$/.exec(size.trim());
    if (!match) {
        return 1;
    }
    return Math.max(1, Number(match[1]));
}

export function widgetJoinsDashboardBoard(
    widget: {id: string; size?: string},
    exports?: {liveClimate?: boolean},
): boolean {
    return widget.size === "2x1" && (widget.id === "live-climate" || exports?.liveClimate === true);
}
