import {MIN_PASSWORD_LENGTH} from "@/lib/password-policy";

export function passwordLineScale(value: string): number {
    return Math.min(1, value.length / MIN_PASSWORD_LENGTH);
}

export function passwordLineMet(value: string): boolean {
    return value.length >= MIN_PASSWORD_LENGTH;
}
