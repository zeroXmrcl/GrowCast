import policy from "./password-policy.json" with {type: "json"};

/** Minimum admin password length (characters). Single source: password-policy.json */
export const MIN_PASSWORD_LENGTH = policy.minPasswordLength;

export const MAX_PASSWORD_LENGTH = policy.maxPasswordLength;

/**
 * Returns true if the password meets the strength policy used by setup and login.
 */
export function validatePasswordStrength(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH && password.length <= MAX_PASSWORD_LENGTH;
}
