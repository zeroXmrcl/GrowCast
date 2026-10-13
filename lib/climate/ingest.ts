import {isClimatePoint} from "@/lib/climate/store";
import type {ClimatePoint} from "@/lib/climate/types";

const MAX_POINTS = 20_000;

export function parseClimateHistoryBody(raw: unknown): {ok: true; points: ClimatePoint[]} | {ok: false} {
    if (!raw || typeof raw !== "object" || !Array.isArray((raw as {points?: unknown}).points)) {
        return {ok: false};
    }
    const rows = (raw as {points: unknown[]}).points;
    if (rows.length > MAX_POINTS) {
        return {ok: false};
    }
    const points = rows.filter((row): row is ClimatePoint => {
        if (!row || typeof row !== "object") {
            return false;
        }
        const point = row as ClimatePoint;
        return typeof point.t === "string" && isClimatePoint(point);
    });
    return {ok: true, points};
}
