import policy from "./password-policy.json" with {type: "json"};

/** Minimum admin password length (characters). Single source: password-policy.json */
export const MIN_PASSWORD_LENGTH = policy.minPasswordLength;

export const MAX_PASSWORD_LENGTH = policy.maxPasswordLength;

/**
 * Setup-time strength policy (min + max). Default `setup:admin` uses this;
 * `setup:admin:insecure` / `--allow-insecure` relaxes the minimum.
 * Login does not use this — see {@link validatePasswordHardLimits}.
 */
export function validatePasswordStrength(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH && password.length <= MAX_PASSWORD_LENGTH;
}

/**
 * Hard limits for passwords at login: non-empty and within max length.
 * Strength (min length) is a setup-time gate only, so credentials created with
 * `setup:admin:insecure` (e.g. short local/dev passwords) can still authenticate
 * via hash verification.
 */
export function validatePasswordHardLimits(password: string): boolean {
  return password.length >= 1 && password.length <= MAX_PASSWORD_LENGTH;
}
