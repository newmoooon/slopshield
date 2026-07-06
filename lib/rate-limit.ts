import "server-only";

/**
 * Fixed-window limiter, in-memory only. Good enough for a single Vercel
 * instance guarding a low-traffic public endpoint; not shared across
 * serverless invocations, so it's defense-in-depth rather than a hard cap.
 */
class FixedWindowLimiter {
  private readonly windowMs: number;
  private readonly max: number;
  private counts = new Map<string, { count: number; resetAt: number }>();

  constructor(max: number, windowMs: number) {
    this.max = max;
    this.windowMs = windowMs;
  }

  check(key: string): boolean {
    const now = Date.now();
    const entry = this.counts.get(key);

    if (!entry || now >= entry.resetAt) {
      this.counts.set(key, { count: 1, resetAt: now + this.windowMs });
      if (this.counts.size > 5000) this.evictExpired(now);
      return true;
    }

    if (entry.count >= this.max) return false;
    entry.count += 1;
    return true;
  }

  private evictExpired(now: number) {
    for (const [key, entry] of this.counts) {
      if (now >= entry.resetAt) this.counts.delete(key);
    }
  }
}

/** Caps fresh (cache-miss) badge audits globally — the expensive path (GitHub + Gemini calls). */
export const badgeGlobalLimiter = new FixedWindowLimiter(30, 60_000);

/** Caps fresh badge audits per requesting IP, on top of the global cap. */
export const badgeIpLimiter = new FixedWindowLimiter(10, 60_000);

/** Caps authenticated dashboard audits per signed-in user (keyed by Supabase user id). */
export const scanUserLimiter = new FixedWindowLimiter(8, 60_000);
