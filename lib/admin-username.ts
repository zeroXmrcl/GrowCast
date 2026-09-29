const MAX_USERNAME_LENGTH = 64;

function stripInvisibleControls(value: string): string {
    return value.replace(/[\u0000-\u001F\u007F]/g, "");
}

export function normalizeUsernameInput(input: string): string {
    return stripInvisibleControls(input).normalize("NFKC").trim();
}

export function validateUsernameInput(input: string): boolean {
    if (input.length < 1 || input.length > MAX_USERNAME_LENGTH) {
        return false;
    }
    return /^[a-zA-Z0-9._@-]+$/.test(input);
}
