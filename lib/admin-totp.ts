import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import {unlink} from "node:fs/promises";
import {readFileSync} from "node:fs";
import path from "node:path";
import {atomicWriteFile} from "@/lib/atomic-file";
import {safeEqualText, safeEqualBuffer} from "@/lib/crypto-equal";
import {growcastDataDir} from "@/lib/data-paths";

/** RFC 6238 parameters that authenticator apps scan from an otpauth URI. */
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
export const TOTP_SECRET_BYTES = 20;
export const TOTP_WINDOW_STEPS = 1;
export const RECOVERY_CODE_COUNT = 10;
export const RECOVERY_CODE_BYTES = 10;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ENCRYPTION_INFO = "growcast-totp-v1";
const RECOVERY_INFO = "growcast-totp-recovery-v1";
const FILE_MODE = 0o600;

export type TotpAccount = {
  username: string;
  passwordHash: string;
};

type EncryptedSecret = {
  iv: string;
  tag: string;
  ct: string;
};

type ActiveTotpFile = {
  version: 1;
  accountTag: string;
  secret: EncryptedSecret;
  lastAcceptedStep: number;
  recoveryCodes: string[];
  createdAt: string;
};

type PendingTotpFile = {
  version: 1;
  accountTag: string;
  secret: EncryptedSecret;
  createdAt: string;
};

export type TotpInspection =
  | {state: "disabled"}
  | {state: "mismatch"}
  | {state: "corrupt"}
  | {state: "enrolled"};

export type TotpSetupMaterial = {
  manualKey: string;
  otpauthUrl: string;
};

export type SecondFactorConsumeResult =
  | {ok: true; method: "totp" | "recovery"}
  | {ok: false; reason: "invalid" | "corrupt" | "disabled" | "mismatch"};

type LoadedTotp =
  | {state: "disabled"}
  | {state: "mismatch"}
  | {state: "corrupt"}
  | {state: "enrolled"; record: ActiveTotpFile; secret: Buffer};

function setupDir(): string {
  return path.join(growcastDataDir(), "setup");
}

export function activeTotpPath(): string {
  return path.join(setupDir(), "totp.json");
}

export function pendingTotpPath(): string {
  return path.join(setupDir(), "totp.pending.json");
}

function deriveKey(sessionSecret: string, info: string): Buffer {
  return Buffer.from(hkdfSync("sha256", sessionSecret, Buffer.alloc(0), info, 32));
}

/** SHA-256 of the username and password hash, separated so the fields cannot collide. */
export function adminAccountTag(username: string, passwordHash: string): string {
  return createHash("sha256")
    .update(username, "utf8")
    .update("\0")
    .update(passwordHash, "utf8")
    .digest("base64url");
}

export function encodeBase32(data: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += BASE32_ALPHABET[(value >>> bits) & 31];
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function formatBase32Groups(encoded: string): string {
  return encoded.replace(/(.{4})(?=.)/g, "$1 ").trim();
}

function encodeCrockford(data: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += CROCKFORD_ALPHABET[(value >>> bits) & 31];
    }
  }
  if (bits > 0) {
    output += CROCKFORD_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function formatRecoveryCode(compact: string): string {
  return compact.match(/.{4}/g)?.join("-") ?? compact;
}

export function normalizeRecoveryCode(input: string): string | null {
  const compact = input.trim().toUpperCase().replace(/[\s-]/g, "");
  if (!/^[0-9A-HJKMNP-TV-Z]{16}$/.test(compact)) {
    return null;
  }
  return compact;
}

export function generateTotpSecret(): Buffer {
  return randomBytes(TOTP_SECRET_BYTES);
}

export function generateRecoveryCodes(): string[] {
  const codes: string[] = [];
  for (let index = 0; index < RECOVERY_CODE_COUNT; index += 1) {
    const compact = encodeCrockford(randomBytes(RECOVERY_CODE_BYTES));
    codes.push(formatRecoveryCode(compact));
  }
  return codes;
}

export function totpStep(nowMs: number): number {
  return Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);
}

export function totpCodeForStep(secret: Buffer, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", secret).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    (hmac[offset + 1]! << 16) |
    (hmac[offset + 2]! << 8) |
    hmac[offset + 3]!;
  const otp = binary % 1_000_000;
  return otp.toString().padStart(TOTP_DIGITS, "0");
}

/**
 * Accept a code in the current step or one step either side, and reject any
 * step that has already been accepted.
 */
export function matchTotpStep(
  secret: Buffer,
  code: string,
  lastAcceptedStep: number,
  nowMs: number,
): number | null {
  if (!/^\d{6}$/.test(code)) {
    return null;
  }
  const nowStep = totpStep(nowMs);
  let matched: number | null = null;
  for (let offset = -TOTP_WINDOW_STEPS; offset <= TOTP_WINDOW_STEPS; offset += 1) {
    const step = nowStep + offset;
    const actual = totpCodeForStep(secret, step);
    const equal = safeEqualText(actual, code);
    if (equal && step > lastAcceptedStep && (matched === null || step > matched)) {
      matched = step;
    }
  }
  return matched;
}

export function otpauthUrl(username: string, secret: Buffer): string {
  const label = encodeURIComponent(`GrowCast:${username}`);
  const params = new URLSearchParams({
    secret: encodeBase32(secret),
    issuer: "GrowCast",
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

function recoveryMac(normalizedCode: string, sessionSecret: string): Buffer {
  return createHmac("sha256", deriveKey(sessionSecret, RECOVERY_INFO))
    .update(normalizedCode)
    .digest();
}

function recoveryHash(code: string, sessionSecret: string): string {
  const normalized = normalizeRecoveryCode(code);
  if (!normalized) {
    throw new Error("Recovery code format is invalid.");
  }
  return recoveryMac(normalized, sessionSecret).toString("base64url");
}

function encryptSecret(plain: Buffer, sessionSecret: string): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(sessionSecret, ENCRYPTION_INFO), iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return {
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ct: ciphertext.toString("base64url"),
  };
}

function decryptSecret(encrypted: EncryptedSecret, sessionSecret: string): Buffer {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    deriveKey(sessionSecret, ENCRYPTION_INFO),
    Buffer.from(encrypted.iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(encrypted.tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ct, "base64url")),
    decipher.final(),
  ]);
}

function readJsonFile(filePath: string): unknown | "missing" | "corrupt" {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return "missing";
    }
    return "corrupt";
  }
}

function parseEncrypted(value: unknown): EncryptedSecret | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const iv = record.iv;
  const tag = record.tag;
  const ct = record.ct;
  if (typeof iv !== "string" || typeof tag !== "string" || typeof ct !== "string") {
    return null;
  }
  if (iv.length === 0 || tag.length === 0 || ct.length === 0) {
    return null;
  }
  return {iv, tag, ct};
}

function parseActive(value: unknown): ActiveTotpFile | "corrupt" {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "corrupt";
  }
  const record = value as Record<string, unknown>;
  if (record.version !== 1) {
    return "corrupt";
  }
  if (typeof record.accountTag !== "string" || record.accountTag.length === 0) {
    return "corrupt";
  }
  const secret = parseEncrypted(record.secret);
  if (!secret) {
    return "corrupt";
  }
  if (typeof record.lastAcceptedStep !== "number" || !Number.isInteger(record.lastAcceptedStep)) {
    return "corrupt";
  }
  if (record.lastAcceptedStep < 0) {
    return "corrupt";
  }
  if (!Array.isArray(record.recoveryCodes) || record.recoveryCodes.some((item) => typeof item !== "string")) {
    return "corrupt";
  }
  if (typeof record.createdAt !== "string" || record.createdAt.length === 0) {
    return "corrupt";
  }
  return {
    version: 1,
    accountTag: record.accountTag,
    secret,
    lastAcceptedStep: record.lastAcceptedStep,
    recoveryCodes: record.recoveryCodes as string[],
    createdAt: record.createdAt,
  };
}

function parsePending(value: unknown): PendingTotpFile | "corrupt" {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "corrupt";
  }
  const record = value as Record<string, unknown>;
  if (record.version !== 1) {
    return "corrupt";
  }
  if (typeof record.accountTag !== "string" || record.accountTag.length === 0) {
    return "corrupt";
  }
  const secret = parseEncrypted(record.secret);
  if (!secret) {
    return "corrupt";
  }
  if (typeof record.createdAt !== "string" || record.createdAt.length === 0) {
    return "corrupt";
  }
  return {
    version: 1,
    accountTag: record.accountTag,
    secret,
    createdAt: record.createdAt,
  };
}

function loadActive(account: TotpAccount, sessionSecret: string): LoadedTotp {
  const parsed = readJsonFile(activeTotpPath());
  if (parsed === "missing") {
    return {state: "disabled"};
  }
  if (parsed === "corrupt") {
    return {state: "corrupt"};
  }
  const record = parseActive(parsed);
  if (record === "corrupt") {
    return {state: "corrupt"};
  }
  if (record.accountTag !== adminAccountTag(account.username, account.passwordHash)) {
    return {state: "mismatch"};
  }
  try {
    return {
      state: "enrolled",
      record,
      secret: decryptSecret(record.secret, sessionSecret),
    };
  } catch {
    return {state: "corrupt"};
  }
}

async function writeActive(record: ActiveTotpFile): Promise<void> {
  await atomicWriteFile(activeTotpPath(), `${JSON.stringify(record)}\n`, FILE_MODE);
}

async function writePending(record: PendingTotpFile): Promise<void> {
  await atomicWriteFile(pendingTotpPath(), `${JSON.stringify(record)}\n`, FILE_MODE);
}

function ignoreMissing(error: unknown): void {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
    throw error;
  }
}

export function inspectAdminTotp(account: TotpAccount, sessionSecret: string): TotpInspection {
  const loaded = loadActive(account, sessionSecret);
  if (loaded.state === "enrolled") {
    return {state: "enrolled"};
  }
  return loaded;
}

export async function beginTotpSetup(
  account: TotpAccount,
  sessionSecret: string,
  username: string,
  secret: Buffer = generateTotpSecret(),
): Promise<TotpSetupMaterial> {
  await writePending({
    version: 1,
    accountTag: adminAccountTag(account.username, account.passwordHash),
    secret: encryptSecret(secret, sessionSecret),
    createdAt: new Date().toISOString(),
  });
  return {
    manualKey: formatBase32Groups(encodeBase32(secret)),
    otpauthUrl: otpauthUrl(username, secret),
  };
}

export function readPendingTotpSetup(
  account: TotpAccount,
  sessionSecret: string,
  username: string,
): TotpSetupMaterial | null {
  const parsed = readJsonFile(pendingTotpPath());
  if (parsed === "missing" || parsed === "corrupt") {
    return null;
  }
  const record = parsePending(parsed);
  if (record === "corrupt") {
    return null;
  }
  if (record.accountTag !== adminAccountTag(account.username, account.passwordHash)) {
    return null;
  }
  try {
    const secret = decryptSecret(record.secret, sessionSecret);
    return {
      manualKey: formatBase32Groups(encodeBase32(secret)),
      otpauthUrl: otpauthUrl(username, secret),
    };
  } catch {
    return null;
  }
}

export async function confirmPendingTotp(
  account: TotpAccount,
  sessionSecret: string,
  code: string,
  nowMs = Date.now(),
): Promise<{ok: true; recoveryCodes: string[]} | {ok: false; reason: "missing" | "corrupt" | "invalid" | "mismatch"}> {
  const parsed = readJsonFile(pendingTotpPath());
  if (parsed === "missing") {
    return {ok: false, reason: "missing"};
  }
  if (parsed === "corrupt") {
    return {ok: false, reason: "corrupt"};
  }
  const record = parsePending(parsed);
  if (record === "corrupt") {
    return {ok: false, reason: "corrupt"};
  }
  const expectedTag = adminAccountTag(account.username, account.passwordHash);
  if (record.accountTag !== expectedTag) {
    return {ok: false, reason: "mismatch"};
  }
  let secret: Buffer;
  try {
    secret = decryptSecret(record.secret, sessionSecret);
  } catch {
    return {ok: false, reason: "corrupt"};
  }
  const step = matchTotpStep(secret, code.trim(), 0, nowMs);
  if (step === null) {
    return {ok: false, reason: "invalid"};
  }
  const recoveryCodes = generateRecoveryCodes();
  await writeActive({
    version: 1,
    accountTag: expectedTag,
    secret: record.secret,
    lastAcceptedStep: step,
    recoveryCodes: recoveryCodes.map((entry) => recoveryHash(entry, sessionSecret)),
    createdAt: new Date().toISOString(),
  });
  await unlink(pendingTotpPath()).catch(ignoreMissing);
  return {ok: true, recoveryCodes};
}

function matchRecoveryIndex(hashes: string[], code: string, sessionSecret: string): number | null {
  const normalized = normalizeRecoveryCode(code);
  if (!normalized) {
    return null;
  }
  const actual = recoveryMac(normalized, sessionSecret);
  let matched: number | null = null;
  for (let index = 0; index < hashes.length; index += 1) {
    const hash = hashes[index];
    if (!hash) {
      continue;
    }
    let expected: Buffer;
    try {
      expected = Buffer.from(hash, "base64url");
    } catch {
      continue;
    }
    if (expected.length === actual.length && safeEqualBuffer(actual, expected) && matched === null) {
      matched = index;
    }
  }
  return matched;
}

export async function consumeSecondFactor(
  account: TotpAccount,
  sessionSecret: string,
  code: string,
  kind: "totp" | "recovery",
  nowMs = Date.now(),
): Promise<SecondFactorConsumeResult> {
  const loaded = loadActive(account, sessionSecret);
  if (loaded.state !== "enrolled") {
    return {ok: false, reason: loaded.state === "disabled" ? "disabled" : loaded.state};
  }
  if (kind === "recovery") {
    const index = matchRecoveryIndex(loaded.record.recoveryCodes, code, sessionSecret);
    if (index === null) {
      return {ok: false, reason: "invalid"};
    }
    const recoveryCodes = loaded.record.recoveryCodes.filter((_, itemIndex) => itemIndex !== index);
    await writeActive({...loaded.record, recoveryCodes});
    return {ok: true, method: "recovery"};
  }
  const step = matchTotpStep(loaded.secret, code.trim(), loaded.record.lastAcceptedStep, nowMs);
  if (step === null) {
    return {ok: false, reason: "invalid"};
  }
  await writeActive({...loaded.record, lastAcceptedStep: step});
  return {ok: true, method: "totp"};
}

export async function replaceRecoveryCodes(
  account: TotpAccount,
  sessionSecret: string,
): Promise<{ok: true; recoveryCodes: string[]} | {ok: false; reason: "disabled" | "mismatch" | "corrupt"}> {
  const loaded = loadActive(account, sessionSecret);
  if (loaded.state !== "enrolled") {
    return {ok: false, reason: loaded.state === "disabled" ? "disabled" : loaded.state};
  }
  const recoveryCodes = generateRecoveryCodes();
  await writeActive({
    ...loaded.record,
    recoveryCodes: recoveryCodes.map((entry) => recoveryHash(entry, sessionSecret)),
  });
  return {ok: true, recoveryCodes};
}

export async function deletePendingTotp(): Promise<void> {
  await unlink(pendingTotpPath()).catch(ignoreMissing);
}

export async function deleteAdminTotpFiles(): Promise<void> {
  await unlink(activeTotpPath()).catch(ignoreMissing);
  await unlink(pendingTotpPath()).catch(ignoreMissing);
}
