import {APP_TIMEZONE} from "@/lib/app-timezone";

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(timeZone: string): Intl.DateTimeFormat {
    const cached = dateFormatters.get(timeZone);
    if (cached) {
        return cached;
    }
    const created = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });
    dateFormatters.set(timeZone, created);
    return created;
}

export function getDatePartsInTimeZone(
    value: Date,
    timeZone: string = APP_TIMEZONE,
): {year: number; month: number; day: number} {
    const parts = dateFormatter(timeZone).formatToParts(value);
    const year = Number(parts.find((part) => part.type === "year")?.value);
    const month = Number(parts.find((part) => part.type === "month")?.value);
    const day = Number(parts.find((part) => part.type === "day")?.value);

    return {year, month, day};
}

export function todayDateOnly(timeZone: string = APP_TIMEZONE): string {
    const {year, month, day} = getDatePartsInTimeZone(new Date(), timeZone);
    const monthText = String(month).padStart(2, "0");
    const dayText = String(day).padStart(2, "0");
    return `${year}-${monthText}-${dayText}`;
}

export function isDateOnly(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
    );
}
