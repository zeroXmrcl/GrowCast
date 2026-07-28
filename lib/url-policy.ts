/**
 * Allow only navigable http(s) URLs for admin-controlled public links.
 * Rejects javascript:, data:, and other dangerous schemes.
 */

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Returns true if the value is a well-formed absolute http or https URL.
 */
export function isSafeHttpUrl(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return false;
  }

  // Reject credentials in URL userinfo (e.g. https://user:pass@host)
  if (parsed.username || parsed.password) {
    return false;
  }

  // Host must be non-empty
  if (!parsed.hostname || parsed.hostname.length === 0) {
    return false;
  }

  return true;
}

/**
 * Normalize a candidate URL for storage/render.
 * Empty string is allowed (optional fields). Non-empty unsafe values return null.
 */
export function normalizeOptionalHttpUrl(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "";
  }

  if (!isSafeHttpUrl(trimmed)) {
    return null;
  }

  return trimmed;
}

/**
 * For public render: return the URL only if safe, otherwise empty string.
 */
export function safeHttpUrlOrEmpty(value: string | undefined | null): string {
  if (value == null) {
    return "";
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "";
  }

  return isSafeHttpUrl(trimmed) ? trimmed : "";
}

/**
 * react-markdown urlTransform: only allow http(s) and relative paths for same-origin assets.
 * Disallowed schemes become empty (non-navigable).
 */
export function markdownUrlTransform(url: string): string {
  const trimmed = url.trim();
  if (trimmed.length === 0) {
    return "";
  }

  // Allow relative / same-page anchors used in markdown
  if (trimmed.startsWith("#") || trimmed.startsWith("/")) {
    // Block protocol-relative //evil.com
    if (trimmed.startsWith("//")) {
      return "";
    }
    return trimmed;
  }

  if (isSafeHttpUrl(trimmed)) {
    return trimmed;
  }

  return "";
}
