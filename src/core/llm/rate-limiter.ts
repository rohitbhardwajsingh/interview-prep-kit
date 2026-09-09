export interface RateLimiter {
  acquire(estimatedTokens: number): Promise<void>;
}

export interface RateLimiterOptions {
  requestsPerMinute: number;
  /** Free tiers cap tokens per minute as well as requests, and the token cap
   *  is the one a research pipeline hits first. */
  tokensPerMinute: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const MINUTE_MS = 60_000;

class Bucket {
  private available: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,
    startedAt: number,
  ) {
    this.available = capacity;
    this.lastRefill = startedAt;
  }

  private refill(now: number): void {
    const elapsed = now - this.lastRefill;
    if (elapsed <= 0) return;
    this.available = Math.min(
      this.capacity,
      this.available + (elapsed / MINUTE_MS) * this.capacity,
    );
    this.lastRefill = now;
  }

  waitFor(amount: number, now: number): number {
    this.refill(now);
    const shortfall = amount - this.available;
    if (shortfall <= 0) return 0;
    return Math.ceil((shortfall / this.capacity) * MINUTE_MS);
  }

  take(amount: number, now: number): void {
    this.refill(now);
    this.available -= amount;
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Serialises reservations so concurrent cases share one provider budget rather
 * than each assuming the whole allowance. A request larger than the per-minute
 * cap is clamped so it can still proceed instead of waiting forever.
 */
export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const started = now();
  const requests = new Bucket(options.requestsPerMinute, started);
  const tokens = new Bucket(options.tokensPerMinute, started);

  let queue: Promise<void> = Promise.resolve();

  async function reserve(estimatedTokens: number): Promise<void> {
    const wanted = Math.min(
      Math.max(1, estimatedTokens),
      options.tokensPerMinute,
    );

    for (;;) {
      const at = now();
      const wait = Math.max(requests.waitFor(1, at), tokens.waitFor(wanted, at));
      if (wait <= 0) {
        requests.take(1, at);
        tokens.take(wanted, at);
        return;
      }
      await sleep(wait);
    }
  }

  return {
    acquire(estimatedTokens: number): Promise<void> {
      const run = queue.then(() => reserve(estimatedTokens));
      queue = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };
}

export const UNLIMITED: RateLimiter = { acquire: async () => {} };
