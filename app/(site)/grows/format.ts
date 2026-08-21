export function formatDateDisplay(value: string): string {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    }).format(parsed);
}

/** Whole days between seeding and harvest; null when either date is unparseable. */
export function growDurationDays(seededAt: string, harvestedAt: string): number | null {
    const start = new Date(`${seededAt}T00:00:00Z`);
    const end = new Date(`${harvestedAt}T00:00:00Z`);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return null;
    }

    const days = Math.round((end.getTime() - start.getTime()) / 86400000);
    return days >= 0 ? days : null;
}
