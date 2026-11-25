export type Semver = {major: number; minor: number; patch: number};

export function parseSemver(value: string): Semver | null {
    const match = value.trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
    if (!match) {
        return null;
    }
    return {major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3])};
}

export function satisfiesSdkRange(range: string, providedMajor: number): boolean {
    const trimmed = range.trim();
    const caret = trimmed.match(/^\^(\d+)\.(\d+)\.(\d+)$/);
    if (caret) {
        return Number(caret[1]) === providedMajor;
    }
    const exact = parseSemver(trimmed);
    if (exact) {
        return exact.major === providedMajor;
    }
    return false;
}
