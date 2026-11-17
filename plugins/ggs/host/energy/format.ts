export function formatWatts(value: number | null): string {
    return value === null ? "—" : String(Math.round(value));
}

export function formatKwh(value: number): string {
    return value.toFixed(1);
}

export function formatEur(value: number | null): string {
    return value === null ? "—" : value.toFixed(2);
}

export function formatHoursOn(value: number): string {
    return value.toFixed(1);
}

export function formatSharePct(value: number): string {
    return `${Math.round(value)}%`;
}

export function formatTariffRate(value: number | null): string {
    return value === null ? "—" : `${value.toFixed(2)} €/kWh`;
}
