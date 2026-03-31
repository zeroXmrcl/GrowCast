import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const ADMIN_SESSION_COOKIE = "growcast_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

const MAX_USERNAME_LENGTH = 64;
const MAX_PASSWORD_LENGTH = 1024;

const sessionStore = new Map<string, StoredAdminSession>();
const loginAttemptStore = new Map<string, LoginAttemptState>();

type StoredAdminSession = {
  sid: string;
  username: string;
  expiresAt: number;
  createdAt: number;
};

type LoginAttemptState = {
  count: number;
  firstAttemptAt: number;
  blockedUntil: number;
};

type AdminConfig = {
  username: string;
  passwordHash: string;
  secret: string;
};

type AdminSetupStatus = {
  isConfigured: boolean;
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
  return normalized.length > 0 ? normalized : undefined;
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
    isConfigured: warnings.length === 0,
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

function stripInvisibleControls(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F]/g, "");
}

function normalizeUsernameInput(input: string): string {
  return stripInvisibleControls(input).normalize("NFKC").trim();
}

function validateUsernameInput(input: string): boolean {
  if (input.length < 1 || input.length > MAX_USERNAME_LENGTH) {
    return false;
  }

  return /^[a-zA-Z0-9._@-]+$/.test(input);
}

function normalizePasswordInput(input: string): string {
  return stripInvisibleControls(input).normalize("NFKC");
}

function validatePasswordInput(input: string): boolean {
  return input.length >= 1 && input.length <= MAX_PASSWORD_LENGTH;
}

function safeEqualText(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a, "utf8");
  const bBuffer = Buffer.from(b, "utf8");

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return timingSafeEqual(aBuffer, bBuffer);
}

function safeEqualBuffer(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
}

export function hashAdminPasswordForEnv(plainPassword: string): string {
  const normalized = normalizePasswordInput(plainPassword);

  if (!validatePasswordInput(normalized)) {
    throw new Error("Invalid password format.");
  }

  const salt = randomBytes(16);
  const derivedKey = scryptSync(normalized, salt, 64);

  return `scrypt$${salt.toString("base64url")}$${derivedKey.toString("base64url")}`;
}

function verifyPassword(passwordInput: string, storedHash: string): boolean {
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

async function setSessionCookie(sessionToken: string): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(ADMIN_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
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

export function isAdminLoginEnabled(): boolean {
  return getAdminSetupStatus().canLogin;
}

export async function isAdminAuthenticated(): Promise<boolean> {
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
    return false;
  }

  const now = nowEpochSeconds();
  if (payload.exp <= now) {
    return false;
  }

  const session = sessionStore.get(payload.sid);
  if (!session) {
    return false;
  }

  if (session.expiresAt <= now) {
    sessionStore.delete(payload.sid);
    return false;
  }

  return true;
}

export async function loginAdmin(
    usernameInput: string,
    passwordInput: string,
    clientKey = "global",
): Promise<LoginResult> {
  clearExpiredSessions();

  const status = getAdminSetupStatus();
  if (!status.canLogin) {
    return {
      ok: false,
      code: "login_disabled",
      reason: "Admin login is unavailable because the admin configuration is incomplete.",
    };
  }

  const rateLimit = consumeLoginAttempt(clientKey);
  if (!rateLimit.allowed) {
    return {
      ok: false,
      code: "rate_limited",
      reason: "Too many failed login attempts.",
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    };
  }

  const normalizedUsername = normalizeUsernameInput(usernameInput);
  const normalizedPassword = normalizePasswordInput(passwordInput);

  if (!validateUsernameInput(normalizedUsername) || !validatePasswordInput(normalizedPassword)) {
    return {
      ok: false,
      code: "invalid_credentials",
      reason: "Invalid credentials.",
    };
  }

  const config = getRequiredAdminConfig();

  const usernameMatches = safeEqualText(normalizedUsername, config.username);
  const passwordMatches = verifyPassword(normalizedPassword, config.passwordHash);

  if (!usernameMatches || !passwordMatches) {
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
    username: config.username,
    createdAt: now,
    expiresAt,
  });

  const sessionToken = encodeSessionToken({ sid, exp: expiresAt }, config.secret);
  await setSessionCookie(sessionToken);

  return { ok: true };
}

export async function logoutAdmin(): Promise<void> {
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
}

export async function requireAdmin(): Promise<void> {
  const authenticated = await isAdminAuthenticated();

  if (!authenticated) {
    redirect("/admin?error=unauthorized");
  }
}