type LoginBucket = {
  attempts: number;
  windowStartedAt: number;
  blockedUntil: number;
};

const buckets = new Map<string, LoginBucket>();

const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const BLOCK_MS = 15 * 60 * 1000;

function getOrCreateBucket(key: string, now: number): LoginBucket {
  const current = buckets.get(key);

  if (!current) {
    const next = {
      attempts: 0,
      windowStartedAt: now,
      blockedUntil: 0,
    };
    buckets.set(key, next);
    return next;
  }

  if (now - current.windowStartedAt > WINDOW_MS) {
    current.attempts = 0;
    current.windowStartedAt = now;
  }

  return current;
}

export function getAdminLoginBlockStatus(key: string): { blocked: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const bucket = getOrCreateBucket(key, now);

  if (bucket.blockedUntil > now) {
    return {
      blocked: true,
      retryAfterSeconds: Math.ceil((bucket.blockedUntil - now) / 1000),
    };
  }

  return { blocked: false, retryAfterSeconds: 0 };
}

export function recordFailedAdminLogin(key: string): { blocked: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const bucket = getOrCreateBucket(key, now);

  if (bucket.blockedUntil > now) {
    return {
      blocked: true,
      retryAfterSeconds: Math.ceil((bucket.blockedUntil - now) / 1000),
    };
  }

  bucket.attempts += 1;

  if (bucket.attempts >= MAX_ATTEMPTS) {
    bucket.blockedUntil = now + BLOCK_MS;
    return {
      blocked: true,
      retryAfterSeconds: Math.ceil(BLOCK_MS / 1000),
    };
  }

  return { blocked: false, retryAfterSeconds: 0 };
}

export function clearAdminLoginFailures(key: string): void {
  buckets.delete(key);
}
