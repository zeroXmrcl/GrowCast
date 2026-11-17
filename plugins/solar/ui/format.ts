export function dash(value: string | number | null | undefined): string {
    return value === null || value === undefined || value === "" ? "—" : String(value);
}

export function formatWatts(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) {
        return "—";
    }
    return `${Math.round(value).toLocaleString("en-US")} W`;
}

export function formatKwh(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) {
        return "—";
    }
    return `${value.toFixed(1)} kWh`;
}

export function formatPct(value: number | null | undefined, digits = 0): string {
    if (value === null || value === undefined || !Number.isFinite(value)) {
        return "—";
    }
    return `${(value * (value > 1 ? 1 : 100)).toFixed(digits)}%`;
}

export function formatShare(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) {
        return "—";
    }
    const pct = value <= 1 ? value * 100 : value;
    return `${Math.round(pct)}%`;
}

export function formatEur(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) {
        return "—";
    }
    return `${value.toFixed(2)} €`;
}

export function signedWatts(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) {
        return "—";
    }
    const rounded = Math.round(value);
    return `${rounded > 0 ? "+" : ""}${rounded.toLocaleString("en-US")} W`;
}
