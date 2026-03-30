export function getDaysSince(date: string | Date): number {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return Math.floor((today.getTime() - start.getTime()) / 86400000);
}