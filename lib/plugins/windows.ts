import {APP_TIMEZONE} from "@/lib/app-timezone";
import {getDatePartsInTimeZone} from "@/lib/date-only";

export function pluginDateOnly(ms: number, timeZone = APP_TIMEZONE): string {
    const {year, month, day} = getDatePartsInTimeZone(new Date(ms), timeZone);
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function shiftDateOnly(dateOnly: string, deltaDays: number): string {
    const [year, month, day] = dateOnly.split("-").map(Number);
    const utc = Date.UTC(year, month - 1, day + deltaDays);
    const shifted = new Date(utc);
    return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(
        shifted.getUTCDate(),
    ).padStart(2, "0")}`;
}

export function pluginDateWindow(endDate: string, days: number): string[] {
    const dates: string[] = [];
    for (let i = 0; i < days; i += 1) {
        dates.push(shiftDateOnly(endDate, -i));
    }
    return dates;
}
