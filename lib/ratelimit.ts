// Fixed-window in-memory rate limiter. Per-instance (fine for a
// single-node v1); swap the store for Redis when horizontally scaling.
// Edge-runtime safe: no Node APIs.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

export interface LimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function checkLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): LimitResult {
  // Opportunistic cleanup so the map cannot grow unbounded.
  if (buckets.size > MAX_BUCKETS) {
    Array.from(buckets.entries()).forEach(([k, b]) => {
      if (b.resetAt <= now) buckets.delete(k);
    });
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }
  if (bucket.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }
  bucket.count += 1;
  return {
    allowed: true,
    remaining: limit - bucket.count,
    retryAfterSeconds: 0,
  };
}

/** Test hook. */
export function resetLimits() {
  buckets.clear();
}
