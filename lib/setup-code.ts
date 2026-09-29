export const SETUP_CODE_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
export const SETUP_CODE_GROUP = 4;
export const SETUP_CODE_LENGTH = SETUP_CODE_GROUP * 2;

const SHAPED = new RegExp(
    `[${SETUP_CODE_ALPHABET}]{${SETUP_CODE_GROUP}}-[${SETUP_CODE_ALPHABET}]{${SETUP_CODE_GROUP}}`,
);

export function compactSetupCode(value: string): string {
    return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Pull a setup code out of a paste, including a log line that contains `xxxx-xxxx`. */
export function parseSetupCodePaste(value: string): string {
    const lower = value.toLowerCase();
    const shaped = lower.match(SHAPED);
    if (shaped?.[0]) {
        return shaped[0].replace("-", "");
    }
    return [...lower]
        .filter((char) => SETUP_CODE_ALPHABET.includes(char))
        .slice(0, SETUP_CODE_LENGTH)
        .join("");
}

export function setupCodeSlots(value: string): string[] {
    const compact = parseSetupCodePaste(value);
    return Array.from({length: SETUP_CODE_LENGTH}, (_, index) => compact[index] ?? "");
}
