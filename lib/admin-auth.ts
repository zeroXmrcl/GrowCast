import { randomUUID, createHmac } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {safeEqualText} from "@/lib/crypto-equal";
import {
  matchAdminCredentials,
  normalizeUsernameInput,
} from "@/lib/admin-credentials";
import {
  consumeSecondFactor,
  inspectAdminTotp,
  type TotpAccount,
} from "@/lib/admin-totp";
import {isSetupComplete, readStoredAdminAccount} from "@/lib/setup-account";
import {SESSION_TTL_SECONDS} from "@/lib/admin-session-policy";
import {
  getAdminLoginAttemptStore,
  getAdminSessionStore,
} from "@/lib/admin-session-store";
import {shouldUseSecureCookie} from "@/lib/request-trust";
import {
  extractClientIp,
  extractUserAgent,
  logAuthLoginDisabled,
  logAuthLoginFailed,
  logAuthLoginRateLimited,
  logAuthLoginSuccess,
  logAuthLoginTotpFailed,
  logAuthLoginTotpRateLimited,
  logAuthLogout,
  logAuthSessionInvalid,
  logAuthTotpRecoveryUsed,
  logAuthTotpUnavailable,
  logAuthzDenied,
  withNextRequestLogContext,
} from "@/lib/logging";

export {SESSION_TTL_SECONDS};

export const ADMIN_SESSION_COOKIE = "growcast_admin_session";
export const ADMIN_PENDING_COOKIE = "growcast_admin_pending";
const SESSION_COOKIE_PATH = "/";
const PENDING_COOKIE_PATH = "/admin";
export const PENDING_TTL_SECONDS = 5 * 60;
const PASSWORD_ATTEMPT_LIMIT = 10;
const SECOND_FACTOR_ATTEMPT_LIMIT = 5;

export type AdminAuthCookies = {
  get(name: string): Promise<string | undefined> | string | undefined;
  set(
    name: string,
    value: string,
    options: {maxAge: number; path: string},
  ): Promise<void> | void;
  delete(name: string, path: string): Promise<void> | void;
};

export type AdminAuthDeps = {
  cookies?: AdminAuthCookies;
};

const sessionStore = getAdminSessionStore();
const loginAttemptStore = getAdminLoginAttemptStore();

export type AdminConfig = {
  username: string;
  passwordHash: string;
  secret: string;
};

type AdminSetupStatus = {
  canLogin: boolean;
  warnings: string[];
};

export type LoginResult =
    | { ok: true }
    | {
  ok: false;
  code: "login_disabled" | "rate_limited" | "invalid_credentials" | "totp_required" | "totp_unavailable";
  reason: string;
  retryAfterSeconds?: number;
};

export type SecondFactorResult =
    | { ok: true }
    | {
  ok: false;
  code: "rate_limited" | "totp_invalid" | "pending_expired" | "totp_unavailable" | "login_disabled";
  reason: string;
  retryAfterSeconds?: number;
};

export type PasswordGateResult =
    | { ok: true; account: AdminConfig }
    | { ok: false; code: "rate_limited" | "rejected" | "login_disabled"; retryAfterSeconds?: number };

function getEnv(name: string): string | undefined {
  const value = process.env[name];
  if (!value) {
    return undefined;
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    return undefined;
  }

  if (name === "ADMIN_PASSWORD_HASH") {
    return normalized.replace(/\\\$/g, "$");
  }

  return normalized;
}

function assessAdminConfig(
  username: string | undefined,
  passwordHash: string | undefined,
  secret: string | undefined,
): AdminSetupStatus {
  const warnings: string[] = [];

  if (!username) {
    warnings.push("ADMIN_USERNAME is not set.");
  }

  if (!passwordHash) {
    warnings.push("ADMIN_PASSWORD_HASH is not set.");
  }

  if (!secret) {
    warnings.push("ADMIN_SESSION_SECRET is not set.");
  }

  if (username === "change-me") {
    warnings.push("ADMIN_USERNAME is still using an insecure placeholder value.");
  }

  if (passwordHash === "change-me") {
    warnings.push("ADMIN_PASSWORD_HASH is still using an insecure placeholder value.");
  }

  if (secret === "generate-me") {
    warnings.push("ADMIN_SESSION_SECRET is still using an insecure placeholder value.");
  }

  if (secret && secret.length < 32) {
    warnings.push("ADMIN_SESSION_SECRET is too short. Minimum length is 32 characters.");
  }

  if (passwordHash && !passwordHash.startsWith("scrypt$")) {
    warnings.push("ADMIN_PASSWORD_HASH has an unsupported format. Expected 'scrypt$...'.");
  }

  return {
    canLogin: warnings.length === 0,
    warnings,
  };
}

function envAdminStatus(): AdminSetupStatus {
  return assessAdminConfig(
    getEnv("ADMIN_USERNAME"),
    getEnv("ADMIN_PASSWORD_HASH"),
    getEnv("ADMIN_SESSION_SECRET"),
  );
}

/** True when .env.local already has a usable admin account. Existing installs skip the wizard. */
export function isEnvAdminReady(): boolean {
  return envAdminStatus().canLogin;
}

/** First-run wizard. An env admin account, or a finished wizard, skips it. */
export function needsSetupWizard(): boolean {
  if (isEnvAdminReady()) {
    return false;
  }
  return !isSetupComplete();
}

function getAdminSetupStatus(): AdminSetupStatus {
  const fromEnv = envAdminStatus();
  if (fromEnv.canLogin) {
    return fromEnv;
  }
  const stored = readStoredAdminAccount();
  if (stored) {
    const fromFile = assessAdminConfig(stored.username, stored.passwordHash, stored.sessionSecret);
    if (fromFile.canLogin) {
      return fromFile;
    }
  }
  return fromEnv;
}

function getRequiredAdminConfig(): AdminConfig {
  const status = getAdminSetupStatus();

  if (!status.canLogin) {
    throw new Error(status.warnings.join(" "));
  }

  if (isEnvAdminReady()) {
    return {
      username: normalizeUsernameInput(getEnv("ADMIN_USERNAME")!),
      passwordHash: getEnv("ADMIN_PASSWORD_HASH")!,
      secret: getEnv("ADMIN_SESSION_SECRET")!,
    };
  }

  const stored = readStoredAdminAccount();
  if (!stored) {
    throw new Error(status.warnings.join(" "));
  }
  return {
    username: normalizeUsernameInput(stored.username),
    passwordHash: stored.passwordHash,
    secret: stored.sessionSecret,
  };
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function encodeSessionToken(payload: { sid: string; exp: number }, secret: string): string {
  const payloadBase64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = sign(payloadBase64, secret);
  return `${payloadBase64}.${signature}`;
}

function decodeAndVerifySessionToken(
    token: string,
    secret: string,
): { sid: string; exp: number } | null {
  const parts = token.split(".");

  if (parts.length !== 2) {
    return null;
  }

  const [payloadBase64, providedSignature] = parts;
  const expectedSignature = sign(payloadBase64, secret);

  if (!safeEqualText(providedSignature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadBase64, "base64url").toString("utf8")) as {
      sid?: unknown;
      exp?: unknown;
    };

    if (typeof payload.sid !== "string" || typeof payload.exp !== "number") {
      return null;
    }

    return {
      sid: payload.sid,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

function nowEpochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function clearExpiredSessions(): void {
  const now = nowEpochSeconds();

  for (const [sid, session] of sessionStore.entries()) {
    if (session.expiresAt <= now) {
      sessionStore.delete(sid);
    }
  }
}

function consumeLoginAttempt(
  key: string,
  limit = PASSWORD_ATTEMPT_LIMIT,
): { allowed: boolean; retryAfterSeconds?: number } {
  const now = nowEpochSeconds();
  const existing = loginAttemptStore.get(key);

  if (existing && existing.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: existing.blockedUntil - now,
    };
  }

  if (!existing || now - existing.firstAttemptAt > 15 * 60) {
    loginAttemptStore.set(key, {
      count: 1,
      firstAttemptAt: now,
      blockedUntil: 0,
    });

    return { allowed: true };
  }

  existing.count += 1;

  if (existing.count > limit) {
    existing.blockedUntil = now + 15 * 60;
    loginAttemptStore.set(key, existing);

    return {
      allowed: false,
      retryAfterSeconds: 15 * 60,
    };
  }

  loginAttemptStore.set(key, existing);
  return { allowed: true };
}

function resetLoginAttempts(key: string): void {
  loginAttemptStore.delete(key);
}

function peekLoginAttempt(key: string): { blocked: boolean; retryAfterSeconds?: number } {
  const now = nowEpochSeconds();
  const existing = loginAttemptStore.get(key);
  if (existing && existing.blockedUntil > now) {
    return {
      blocked: true,
      retryAfterSeconds: existing.blockedUntil - now,
    };
  }
  return { blocked: false };
}

/** Map the password limiter key onto the authenticator limiter key. */
export function secondFactorAttemptKey(loginClientKey: string): string {
  const prefix = "admin-login:";
  const identity = loginClientKey.startsWith(prefix)
    ? loginClientKey.slice(prefix.length)
    : loginClientKey;
  return `admin-totp:${identity}`;
}

async function getClientLogFields(): Promise<{
  client_ip?: string;
  user_agent?: string;
}> {
  try {
    const h = await headers();
    return {
      client_ip: extractClientIp(h),
      user_agent: extractUserAgent(h),
    };
  } catch {
    return {};
  }
}

async function defaultCookieJar(): Promise<AdminAuthCookies> {
  const cookieStore = await cookies();
  let headerList: Headers;
  try {
    headerList = await headers();
  } catch {
    headerList = new Headers();
  }
  const secure = shouldUseSecureCookie(headerList);
  return {
    get(name) {
      return cookieStore.get(name)?.value;
    },
    set(name, value, options) {
      cookieStore.set(name, value, {
        httpOnly: true,
        secure,
        sameSite: "lax",
        path: options.path,
        maxAge: options.maxAge,
      });
    },
    delete(name, path) {
      cookieStore.delete({
        name,
        path,
        httpOnly: true,
        secure,
        sameSite: "lax",
      });
    },
  };
}

async function cookieJar(deps?: AdminAuthDeps): Promise<AdminAuthCookies> {
  if (deps?.cookies) {
    return deps.cookies;
  }
  return defaultCookieJar();
}

async function setSessionCookie(jar: AdminAuthCookies, sessionToken: string): Promise<void> {
  await jar.set(ADMIN_SESSION_COOKIE, sessionToken, {
    maxAge: SESSION_TTL_SECONDS,
    path: SESSION_COOKIE_PATH,
  });
}

async function setPendingCookie(jar: AdminAuthCookies, pendingToken: string): Promise<void> {
  await jar.set(ADMIN_PENDING_COOKIE, pendingToken, {
    maxAge: PENDING_TTL_SECONDS,
    path: PENDING_COOKIE_PATH,
  });
}

async function deleteSessionCookie(jar: AdminAuthCookies): Promise<void> {
  await jar.delete(ADMIN_SESSION_COOKIE, SESSION_COOKIE_PATH);
}

async function deletePendingCookie(jar: AdminAuthCookies): Promise<void> {
  await jar.delete(ADMIN_PENDING_COOKIE, PENDING_COOKIE_PATH);
}

export function getAdminAuthStatus(): AdminSetupStatus {
  return getAdminSetupStatus();
}


function encodePendingToken(payload: { pid: string; exp: number }, secret: string): string {
  const payloadBase64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = sign(payloadBase64, secret);
  return `${payloadBase64}.${signature}`;
}

function decodePendingToken(
  token: string,
  secret: string,
): { pid: string; exp: number } | null {
  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }
  const [payloadBase64, providedSignature] = parts;
  if (!payloadBase64 || providedSignature === undefined) {
    return null;
  }
  const expectedSignature = sign(payloadBase64, secret);
  if (!safeEqualText(providedSignature, expectedSignature)) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(payloadBase64, "base64url").toString("utf8")) as {
      pid?: unknown;
      exp?: unknown;
    };
    if (typeof payload.pid !== "string" || typeof payload.exp !== "number") {
      return null;
    }
    return { pid: payload.pid, exp: payload.exp };
  } catch {
    return null;
  }
}

function totpAccount(config: AdminConfig): TotpAccount {
  return { username: config.username, passwordHash: config.passwordHash };
}

async function issueAdminSession(jar: AdminAuthCookies, secret: string): Promise<void> {
  const now = nowEpochSeconds();
  const sid = randomUUID();
  const expiresAt = now + SESSION_TTL_SECONDS;
  sessionStore.set(sid, { sid, expiresAt });
  await setSessionCookie(jar, encodeSessionToken({ sid, exp: expiresAt }, secret));
}

async function readPending(
  jar: AdminAuthCookies,
  secret: string,
): Promise<{ pid: string; exp: number } | null> {
  const token = await jar.get(ADMIN_PENDING_COOKIE);
  if (!token) {
    return null;
  }
  const payload = decodePendingToken(token, secret);
  if (!payload || payload.exp <= nowEpochSeconds()) {
    return null;
  }
  return payload;
}

export function getAdminAccount(): AdminConfig {
  return getRequiredAdminConfig();
}

export async function isAdminAuthenticated(deps?: AdminAuthDeps): Promise<boolean> {
  return withNextRequestLogContext("/admin", async () => {
    clearExpiredSessions();

    const status = getAdminSetupStatus();
    if (!status.canLogin) {
      return false;
    }

    const { secret } = getRequiredAdminConfig();
    const jar = await cookieJar(deps);
    const token = await jar.get(ADMIN_SESSION_COOKIE);

    if (!token) {
      return false;
    }

    const payload = decodeAndVerifySessionToken(token, secret);
    if (!payload) {
      const client = await getClientLogFields();
      logAuthSessionInvalid({ reason: "invalid_token", ...client });
      return false;
    }

    const now = nowEpochSeconds();
    if (payload.exp <= now) {
      const client = await getClientLogFields();
      logAuthSessionInvalid({ reason: "token_expired", ...client });
      return false;
    }

    const session = sessionStore.get(payload.sid);
    if (!session) {
      const client = await getClientLogFields();
      logAuthSessionInvalid({ reason: "session_not_found", ...client });
      return false;
    }

    if (session.expiresAt <= now) {
      sessionStore.delete(payload.sid);
      const client = await getClientLogFields();
      logAuthSessionInvalid({ reason: "session_expired", ...client });
      return false;
    }

    return true;
  }, "GET");
}

export async function hasPendingAdminChallenge(deps?: AdminAuthDeps): Promise<boolean> {
  const status = getAdminSetupStatus();
  if (!status.canLogin) {
    return false;
  }
  const { secret } = getRequiredAdminConfig();
  const pending = await readPending(await cookieJar(deps), secret);
  return pending !== null;
}

export async function clearPendingAdminLogin(deps?: AdminAuthDeps): Promise<void> {
  await deletePendingCookie(await cookieJar(deps));
}

export function consumeAdminSecurityAttempt(
  clientKey: string,
): { allowed: boolean; retryAfterSeconds?: number } {
  return consumeLoginAttempt(clientKey, SECOND_FACTOR_ATTEMPT_LIMIT);
}

export function resetAdminSecurityAttempts(clientKey: string): void {
  resetLoginAttempts(clientKey);
}

export function gateAdminPassword(password: string, clientKey: string): PasswordGateResult {
  const status = getAdminSetupStatus();
  if (!status.canLogin) {
    return { ok: false, code: "login_disabled" };
  }
  const rateLimit = consumeLoginAttempt(clientKey, SECOND_FACTOR_ATTEMPT_LIMIT);
  if (!rateLimit.allowed) {
    return {
      ok: false,
      code: "rate_limited",
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    };
  }
  const account = getRequiredAdminConfig();
  if (!matchAdminCredentials(account.username, password, account)) {
    return { ok: false, code: "rejected" };
  }
  return { ok: true, account };
}

export async function loginAdmin(
  usernameInput: string,
  passwordInput: string,
  clientKey = "global",
  deps?: AdminAuthDeps,
): Promise<LoginResult> {
  return withNextRequestLogContext("/admin", async () => {
    clearExpiredSessions();

    const client = await getClientLogFields();

    const status = getAdminSetupStatus();
    if (!status.canLogin) {
      logAuthLoginDisabled({ reason: "login_disabled", ...client });
      return {
        ok: false,
        code: "login_disabled",
        reason: "Admin login is unavailable because the admin configuration is incomplete.",
      };
    }

    const rateLimit = consumeLoginAttempt(clientKey);
    if (!rateLimit.allowed) {
      logAuthLoginRateLimited({
        reason: "rate_limited",
        retry_after_seconds: rateLimit.retryAfterSeconds,
        ...client,
      });
      return {
        ok: false,
        code: "rate_limited",
        reason: "Too many failed login attempts.",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      };
    }

    const config = getRequiredAdminConfig();

    if (!matchAdminCredentials(usernameInput, passwordInput, config)) {
      logAuthLoginFailed({ reason: "invalid_credentials", ...client });
      return {
        ok: false,
        code: "invalid_credentials",
        reason: "Invalid credentials.",
      };
    }

    resetLoginAttempts(clientKey);

    const gate = inspectAdminTotp(totpAccount(config), config.secret);
    if (gate.state === "corrupt") {
      logAuthTotpUnavailable({ reason: "corrupt", ...client });
      return {
        ok: false,
        code: "totp_unavailable",
        reason: "Authenticator data could not be read.",
      };
    }
    if (gate.state === "mismatch") {
      logAuthTotpUnavailable({ reason: "account_mismatch", ...client });
    }
    if (gate.state === "enrolled") {
      const totpKey = secondFactorAttemptKey(clientKey);
      const blocked = peekLoginAttempt(totpKey);
      if (blocked.blocked) {
        logAuthLoginTotpRateLimited({
          reason: "rate_limited",
          retry_after_seconds: blocked.retryAfterSeconds,
          ...client,
        });
        return {
          ok: false,
          code: "rate_limited",
          reason: "Too many failed authenticator attempts.",
          retryAfterSeconds: blocked.retryAfterSeconds,
        };
      }
      const jar = await cookieJar(deps);
      const exp = nowEpochSeconds() + PENDING_TTL_SECONDS;
      await setPendingCookie(jar, encodePendingToken({ pid: randomUUID(), exp }, config.secret));
      return {
        ok: false,
        code: "totp_required",
        reason: "Authenticator code required.",
      };
    }

    const jar = await cookieJar(deps);
    await issueAdminSession(jar, config.secret);
    logAuthLoginSuccess({ ...client });
    return { ok: true };
  });
}

export async function verifyAdminSecondFactor(
  code: string,
  kind: "totp" | "recovery",
  clientKey: string,
  deps?: AdminAuthDeps,
): Promise<SecondFactorResult> {
  return withNextRequestLogContext("/admin", async () => {
    clearExpiredSessions();
    const client = await getClientLogFields();
    const status = getAdminSetupStatus();
    if (!status.canLogin) {
      logAuthLoginDisabled({ reason: "login_disabled", ...client });
      return {
        ok: false,
        code: "login_disabled",
        reason: "Admin login is unavailable because the admin configuration is incomplete.",
      };
    }

    const config = getRequiredAdminConfig();
    const jar = await cookieJar(deps);
    const pending = await readPending(jar, config.secret);
    if (!pending) {
      await deletePendingCookie(jar);
      logAuthLoginTotpFailed({ reason: "pending_expired", ...client });
      return {
        ok: false,
        code: "pending_expired",
        reason: "Sign-in expired.",
      };
    }

    const rateLimit = consumeLoginAttempt(clientKey, SECOND_FACTOR_ATTEMPT_LIMIT);
    if (!rateLimit.allowed) {
      await deletePendingCookie(jar);
      logAuthLoginTotpRateLimited({
        reason: "rate_limited",
        retry_after_seconds: rateLimit.retryAfterSeconds,
        ...client,
      });
      return {
        ok: false,
        code: "rate_limited",
        reason: "Too many failed authenticator attempts.",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      };
    }

    const consumed = await consumeSecondFactor(
      totpAccount(config),
      config.secret,
      code,
      kind,
    );
    if (!consumed.ok && (consumed.reason === "corrupt")) {
      await deletePendingCookie(jar);
      logAuthTotpUnavailable({ reason: "corrupt", ...client });
      return {
        ok: false,
        code: "totp_unavailable",
        reason: "Authenticator data could not be read.",
      };
    }
    if (!consumed.ok) {
      if (consumed.reason === "disabled" || consumed.reason === "mismatch") {
        await deletePendingCookie(jar);
        logAuthLoginTotpFailed({ reason: "pending_expired", ...client });
        return {
          ok: false,
          code: "pending_expired",
          reason: "Sign-in expired.",
        };
      }
      logAuthLoginTotpFailed({ reason: "totp_invalid", ...client });
      return {
        ok: false,
        code: "totp_invalid",
        reason: "Authenticator code was not accepted.",
      };
    }

    resetLoginAttempts(clientKey);
    await deletePendingCookie(jar);
    await issueAdminSession(jar, config.secret);
    if (consumed.method === "recovery") {
      logAuthTotpRecoveryUsed({ ...client });
    }
    logAuthLoginSuccess({ ...client });
    return { ok: true };
  });
}

export async function logoutAdmin(deps?: AdminAuthDeps): Promise<void> {
  await withNextRequestLogContext("/admin/logout", async () => {
    const client = await getClientLogFields();
    const status = getAdminSetupStatus();
    const jar = await cookieJar(deps);

    if (status.canLogin) {
      const { secret } = getRequiredAdminConfig();
      const token = await jar.get(ADMIN_SESSION_COOKIE);
      if (token) {
        const payload = decodeAndVerifySessionToken(token, secret);
        if (payload) {
          sessionStore.delete(payload.sid);
        }
      }
    }

    await deleteSessionCookie(jar);
    await deletePendingCookie(jar);
    logAuthLogout({ ...client });
  });
}

export async function requireAdmin(): Promise<void> {
  await withNextRequestLogContext("/admin", async () => {
    const authenticated = await isAdminAuthenticated();

    if (!authenticated) {
      const client = await getClientLogFields();
      logAuthzDenied({ reason: "unauthenticated", resource: "admin", ...client });
      redirect("/admin?error=unauthorized");
    }
  });
}
