import {APP_TIMEZONE} from "@/lib/app-timezone";
import {getDatePartsInTimeZone} from "@/lib/date-only";

const berlinHourFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    hour: "numeric",
    hourCycle: "h23",
});

export function berlinDateOnly(ms: number): string {
    const {year, month, day} = getDatePartsInTimeZone(new Date(ms));
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function berlinHour(ms: number): number {
    const hourText = berlinHourFormatter.formatToParts(new Date(ms)).find((part) => part.type === "hour")
        ?.value;
    const hour = Number(hourText);
    return Number.isFinite(hour) ? hour : 0;
}

export function shiftDateOnly(dateOnly: string, deltaDays: number): string {
    const [year, month, day] = dateOnly.split("-").map(Number);
    const utc = Date.UTC(year, month - 1, day + deltaDays);
    const shifted = new Date(utc);
    return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(
        shifted.getUTCDate(),
    ).padStart(2, "0")}`;
}

/** Inclusive end date plus the previous `days - 1` Berlin calendar dates. */
export function berlinDateWindow(endDate: string, days: number): string[] {
    const dates: string[] = [];
    for (let i = 0; i < days; i += 1) {
        dates.push(shiftDateOnly(endDate, -i));
    }
    return dates;
}

export function berlinDayStartMs(dateOnly: string): number {
    const [year, month, day] = dateOnly.split("-").map(Number);
    const utcMidnight = Date.UTC(year, month - 1, day);
    // Berlin is UTC+1/+2; ±3h around UTC midnight always contains local 00:00.
    let lo = utcMidnight - 3 * 60 * 60 * 1000;
    let hi = utcMidnight + 3 * 60 * 60 * 1000;
    while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (berlinDateOnly(mid) < dateOnly) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    return lo;
}

export function berlinDayLengthSeconds(dateOnly: string): number {
    const start = berlinDayStartMs(dateOnly);
    const end = berlinDayStartMs(shiftDateOnly(dateOnly, 1));
    return Math.max(1, (end - start) / 1000);
}

export type BerlinHourSlice = {
    date: string;
    hour: number;
    seconds: number;
};

export function nextBerlinHourBoundary(ms: number): number {
    // Fall-back repeats a civil hour for ~2h; search until date/hour actually change.
    const date = berlinDateOnly(ms);
    const hour = berlinHour(ms);
    let lo = ms + 1;
    let hi = ms + 3 * 60 * 60 * 1000;
    while (berlinDateOnly(hi) === date && berlinHour(hi) === hour) {
        hi += 3 * 60 * 60 * 1000;
    }
    while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (berlinDateOnly(mid) === date && berlinHour(mid) === hour) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    return lo;
}

/** Half-open interval [t1Ms, t2Ms). */
export function splitBerlinHours(t1Ms: number, t2Ms: number): BerlinHourSlice[] {
    if (!(t2Ms > t1Ms)) {
        return [];
    }
    const slices: BerlinHourSlice[] = [];
    let t = t1Ms;
    let guard = 0;
    while (t < t2Ms && guard < 48) {
        guard += 1;
        const date = berlinDateOnly(t);
        const hour = berlinHour(t);
        const end = Math.min(t2Ms, nextBerlinHourBoundary(t));
        const seconds = (end - t) / 1000;
        if (seconds > 0) {
            slices.push({date, hour, seconds});
        }
        t = end;
    }
    return slices;
}
