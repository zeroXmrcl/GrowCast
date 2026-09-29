const ADMIN_PASSWORD_MIN = 12;

export function passwordLineScale(value: string): number {
    return Math.min(1, value.length / ADMIN_PASSWORD_MIN);
}

export function passwordLineMet(value: string): boolean {
    return value.length >= ADMIN_PASSWORD_MIN;
}
