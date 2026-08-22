import { randomUUID, createHmac } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {safeEqualText} from "@/lib/crypto-equal";
import {
  matchAdminCredentials,
  normalizeUsernameInput,
} from "@/lib/admin-credentials";
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
  logAuthLogout,
  logAuthSessionInvalid,
  logAuthzDenied,
  withNextRequestLogContext,
} from "@/lib/logging";

export {SESSION_TTL_SECONDS};

const ADMIN_SESSION_COOKIE = "growcast_admin_session";

const sessionStore = getAdminSessionStore();
const loginAttemptStore = getAdminLoginAttemptStore();

type AdminConfig = {
  username: string;
  passwordHash: string;
  secret: string;
};

type AdminSetupStatus = {
  canLogin: boolean;
  warnings: string[];
};

type LoginResult =
    | { ok: true }
    | {
  ok: false;
  code: "login_disabled" | "rate_limited" | "invalid_credentials";
  reason: string;
  retryAfterSeconds?: number;
};

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

function getAdminSetupStatus(): AdminSetupStatus {
  const warnings: string[] = [];

  const username = getEnv("ADMIN_USERNAME");
  const passwordHash = getEnv("ADMIN_PASSWORD_HASH");
  const secret = getEnv("ADMIN_SESSION_SECRET");

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

function getRequiredAdminConfig(): AdminConfig {
  const status = getAdminSetupStatus();

  if (!status.canLogin) {
    throw new Error(status.warnings.join(" "));
  }

  return {
    username: normalizeUsernameInput(getEnv("ADMIN_USERNAME")!),
    passwordHash: getEnv("ADMIN_PASSWORD_HASH")!,
    secret: getEnv("ADMIN_SESSION_SECRET")!,
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

function consumeLoginAttempt(key: string): { allowed: boolean; retryAfterSeconds?: number } {
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

  if (existing.count > 10) {
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

async function setSessionCookie(sessionToken: string): Promise<void> {
  const cookieStore = await cookies();
  let headerList: Headers;
  try {
    headerList = await headers();
  } catch {
    headerList = new Headers();
  }

  cookieStore.set(ADMIN_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: shouldUseSecureCookie(headerList),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

async function deleteSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_COOKIE);
}

export function getAdminAuthStatus(): AdminSetupStatus {
  return getAdminSetupStatus();
}


export async function isAdminAuthenticated(): Promise<boolean> {
  return withNextRequestLogContext("/admin", async () => {
    clearExpiredSessions();

    const status = getAdminSetupStatus();
    if (!status.canLogin) {
      return false;
    }

    const { secret } = getRequiredAdminConfig();
    const cookieStore = await cookies();
    const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

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

export async function loginAdmin(
    usernameInput: string,
    passwordInput: string,
    clientKey = "global",
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

    const now = nowEpochSeconds();
    const sid = randomUUID();
    const expiresAt = now + SESSION_TTL_SECONDS;

    sessionStore.set(sid, {
      sid,
      expiresAt,
    });

    const sessionToken = encodeSessionToken({ sid, exp: expiresAt }, config.secret);
    await setSessionCookie(sessionToken);

    logAuthLoginSuccess({ ...client });

    return { ok: true };
  });
}

export async function logoutAdmin(): Promise<void> {
  await withNextRequestLogContext("/admin/logout", async () => {
    const client = await getClientLogFields();
    const status = getAdminSetupStatus();

    if (status.canLogin) {
      const { secret } = getRequiredAdminConfig();
      const cookieStore = await cookies();
      const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

      if (token) {
        const payload = decodeAndVerifySessionToken(token, secret);
        if (payload) {
          sessionStore.delete(payload.sid);
        }
      }
    }

    await deleteSessionCookie();
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
