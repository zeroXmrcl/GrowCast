export function airVpdKPa(
    tempC: number | null | undefined,
    humidityPct: number | null | undefined,
): number | null {
    if (typeof tempC !== "number" || typeof humidityPct !== "number") {
        return null;
    }
    if (!Number.isFinite(tempC) || !Number.isFinite(humidityPct)) {
        return null;
    }
    const denom = tempC + 237.3;
    if (denom === 0) {
        return null;
    }
    const es = 0.6108 * Math.exp((17.27 * tempC) / denom);
    const vpd = es * (1 - humidityPct / 100);
    return Number.isFinite(vpd) ? vpd : null;
}
