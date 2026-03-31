import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const ADMIN_SESSION_COOKIE = "growcast_admin_session";
const DEFAULT_ADMIN_USERNAME = "change-me";
const DEFAULT_ADMIN_PASSWORD = "change-me";
const DEFAULT_ADMIN_SESSION_SECRET = "generate-me";

function getAdminConfig() {
  return {
    username: process.env.ADMIN_USERNAME ?? DEFAULT_ADMIN_USERNAME,
    password: process.env.ADMIN_PASSWORD ?? DEFAULT_ADMIN_PASSWORD,
    secret: process.env.ADMIN_SESSION_SECRET ?? DEFAULT_ADMIN_SESSION_SECRET,
  };
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return timingSafeEqual(aBuffer, bBuffer);
}

function createSessionValue(username: string, password: string, secret: string): string {
  return createHmac("sha256", secret).update(`${username}:${password}`).digest("hex");
}

export function isUsingDefaultAdminCredentials(): boolean {
  return !process.env.ADMIN_PASSWORD || !process.env.ADMIN_SESSION_SECRET;
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!session) {
    return false;
  }

  const { username, password, secret } = getAdminConfig();
  const expected = createSessionValue(username, password, secret);

  return safeEqual(session, expected);
}

export async function loginAdmin(username: string, password: string): Promise<boolean> {
  const config = getAdminConfig();

  if (!safeEqual(username, config.username) || !safeEqual(password, config.password)) {
    return false;
  }

  const sessionValue = createSessionValue(config.username, config.password, config.secret);
  const cookieStore = await cookies();

  cookieStore.set(ADMIN_SESSION_COOKIE, sessionValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });

  return true;
}

export async function logoutAdmin(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_COOKIE);
}

export async function requireAdmin(): Promise<void> {
  if (!(await isAdminAuthenticated())) {
    throw new Error("Unauthorized");
  }
}
