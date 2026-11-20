import {APP_TIMEZONE} from "@/lib/app-timezone";
import {getDatePartsInTimeZone} from "@/lib/date-only";

const hourFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    hour: "numeric",
    hourCycle: "h23",
});

export function berlinDateOnly(ms: number): string {
    const {year, month, day} = getDatePartsInTimeZone(new Date(ms));
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function berlinHour(ms: number): number {
    const hourText = hourFormatter.formatToParts(new Date(ms)).find((part) => part.type === "hour")
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

/** Inclusive end date plus the previous `days - 1` local calendar dates. */
export function berlinDateWindow(endDate: string, days: number): string[] {
    const dates: string[] = [];
    for (let i = 0; i < days; i += 1) {
        dates.push(shiftDateOnly(endDate, -i));
    }
    return dates;
}
