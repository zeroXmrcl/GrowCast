import {randomBytes, scryptSync} from "node:crypto";
import {normalizeUsernameInput, validateUsernameInput} from "@/lib/admin-username";
import {safeEqualBuffer, safeEqualText} from "@/lib/crypto-equal";
import {validatePasswordHardLimits} from "@/lib/password-policy";

export type AdminCredentialConfig = {
  username: string;
  passwordHash: string;
};

export {normalizeUsernameInput, validateUsernameInput};

export function verifyAdminPassword(passwordInput: string, storedHash: string): boolean {
  try {
    const parts = storedHash.split("$");

    if (parts.length !== 3 || parts[0] !== "scrypt") {
      return false;
    }

    const [, saltBase64Url, hashBase64Url] = parts;

    const salt = Buffer.from(saltBase64Url, "base64url");
    const expectedHash = Buffer.from(hashBase64Url, "base64url");

    if (salt.length === 0 || expectedHash.length === 0) {
      return false;
    }

    const actualHash = scryptSync(passwordInput, salt, expectedHash.length);
    return safeEqualBuffer(actualHash, expectedHash);
  } catch {
    return false;
  }
}

export type MatchAdminCredentialsOptions = {
  /** Test hook: override password verify (defaults to {@link verifyAdminPassword}). */
  verifyPassword?: (passwordInput: string, storedHash: string) => boolean;
};

/**
 * Pure credential check (no cookies/session). Used by loginAdmin and tests.
 * Login only enforces hard password limits (non-empty + max); min strength is setup-time.
 *
 * Username and password checks are always both evaluated (no `&&` short-circuit) so a
 * wrong username still runs scrypt and does not leak via timing vs wrong-password responses.
 */
export function matchAdminCredentials(
  usernameInput: string,
  passwordInput: string,
  config: AdminCredentialConfig,
  options: MatchAdminCredentialsOptions = {},
): boolean {
  const normalizedUsername = normalizeUsernameInput(usernameInput);

  // Format / hard-limit failures never reach hash verify (same as historical login path).
  if (!validateUsernameInput(normalizedUsername) || !validatePasswordHardLimits(passwordInput)) {
    return false;
  }

  const verify = options.verifyPassword ?? verifyAdminPassword;
  const usernameMatches = safeEqualText(normalizedUsername, config.username);
  const passwordMatches = verify(passwordInput, config.passwordHash);
  return usernameMatches && passwordMatches;
}

export function hashAdminPassword(plainPassword: string): string {
  const salt = randomBytes(16);
  const derivedKey = scryptSync(plainPassword, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${derivedKey.toString("base64url")}`;
}
