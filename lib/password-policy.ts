/** Minimum admin password length (characters). Documented strong minimum. */
export const MIN_PASSWORD_LENGTH = 12;

export const MAX_PASSWORD_LENGTH = 1024;

/**
 * Returns true if the password meets the strength policy used by setup and login.
 * Empty / too short / too long fail. Further complexity rules are intentionally not required.
 */
export function validatePasswordStrength(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH && password.length <= MAX_PASSWORD_LENGTH;
}
