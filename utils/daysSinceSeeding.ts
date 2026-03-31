function getDatePartsInTimeZone(value: Date, timeZone: string): { year: number; month: number; day: number } {
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });

    const parts = formatter.formatToParts(value);
    const year = Number(parts.find((p) => p.type === "year")?.value);
    const month = Number(parts.find((p) => p.type === "month")?.value);
    const day = Number(parts.find((p) => p.type === "day")?.value);

    return { year, month, day };
}

export function getDaysSince(date: string | Date): number {
    const MS_PER_DAY = 86400000;
    const appTimeZone = "Europe/Berlin";

    let startYear: number;
    let startMonth: number;
    let startDay: number;

    if (typeof date === "string") {
        const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);

        if (match) {
            startYear = Number(match[1]);
            startMonth = Number(match[2]);
            startDay = Number(match[3]);
        } else {
            const parsed = new Date(date);
            if (Number.isNaN(parsed.getTime())) {
                return 0;
            }
            const parts = getDatePartsInTimeZone(parsed, appTimeZone);
            startYear = parts.year;
            startMonth = parts.month;
            startDay = parts.day;
        }
    } else {
        if (Number.isNaN(date.getTime())) {
            return 0;
        }

        const parts = getDatePartsInTimeZone(date, appTimeZone);
        startYear = parts.year;
        startMonth = parts.month;
        startDay = parts.day;
    }

    if (!Number.isInteger(startYear) || !Number.isInteger(startMonth) || !Number.isInteger(startDay)) {
        return 0;
    }

    const todayParts = getDatePartsInTimeZone(new Date(), appTimeZone);

    const startUtc = Date.UTC(startYear, startMonth - 1, startDay);
    const todayUtc = Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day);

    return Math.max(0, Math.floor((todayUtc - startUtc) / MS_PER_DAY));
}
