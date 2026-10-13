import {airVpdKPa} from "@/lib/air-vpd";
import {climateMetrics} from "@/lib/live-climate-view";
import {withStale, type GgsLiveIngest} from "@/lib/ggs-live";
import {mergeClimatePoints} from "@/lib/climate/store";

export async function recordClimateFromLive(snapshot: GgsLiveIngest): Promise<void> {
    const metrics = climateMetrics(withStale(snapshot));
    if (metrics.tempC === null || metrics.humidityPct === null) {
        return;
    }
    const vpd = airVpdKPa(metrics.tempC, metrics.humidityPct);
    if (vpd === null || !snapshot.updatedAt) {
        return;
    }
    await mergeClimatePoints([{
        t: snapshot.updatedAt,
        tempC: metrics.tempC,
        humidityPct: metrics.humidityPct,
        vpd,
    }]);
}
