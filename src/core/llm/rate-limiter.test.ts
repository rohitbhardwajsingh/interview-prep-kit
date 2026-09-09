import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limiter";

interface Clock {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  waits: number[];
}

function fakeClock(): Clock {
  let current = 0;
  const waits: number[] = [];

  return {
    now: () => current,
    sleep: async (ms: number) => {
      waits.push(ms);
      current += ms;
    },
    waits,
  };
}

describe("createRateLimiter", () => {
  it("lets a burst through up to the request allowance", async () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({
      requestsPerMinute: 5,
      tokensPerMinute: 1_000_000,
      now: clock.now,
      sleep: clock.sleep,
    });

    for (let index = 0; index < 5; index += 1) {
      await limiter.acquire(10);
    }

    expect(clock.waits).toEqual([]);
  });

  it("waits once the request allowance is spent", async () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({
      requestsPerMinute: 2,
      tokensPerMinute: 1_000_000,
      now: clock.now,
      sleep: clock.sleep,
    });

    await limiter.acquire(10);
    await limiter.acquire(10);
    await limiter.acquire(10);

    expect(clock.waits).toHaveLength(1);
    expect(clock.waits[0]).toBeGreaterThan(0);
  });

  it("waits on the token allowance even when requests are available", async () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({
      requestsPerMinute: 100,
      tokensPerMinute: 1_000,
      now: clock.now,
      sleep: clock.sleep,
    });

    await limiter.acquire(800);
    await limiter.acquire(800);

    expect(clock.waits).toHaveLength(1);
  });

  it("refills over time", async () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({
      requestsPerMinute: 1,
      tokensPerMinute: 1_000_000,
      now: clock.now,
      sleep: clock.sleep,
    });

    await limiter.acquire(10);
    await limiter.acquire(10);
    const afterFirstWait = clock.waits.length;
    await limiter.acquire(10);

    expect(afterFirstWait).toBe(1);
    expect(clock.waits).toHaveLength(2);
  });

  it("clamps a request larger than the whole allowance instead of hanging", async () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({
      requestsPerMinute: 10,
      tokensPerMinute: 1_000,
      now: clock.now,
      sleep: clock.sleep,
    });

    await limiter.acquire(50_000);

    expect(clock.waits).toEqual([]);
  });

  it("shares one budget across concurrent callers", async () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({
      requestsPerMinute: 2,
      tokensPerMinute: 1_000_000,
      now: clock.now,
      sleep: clock.sleep,
    });

    await Promise.all([
      limiter.acquire(10),
      limiter.acquire(10),
      limiter.acquire(10),
      limiter.acquire(10),
    ]);

    expect(clock.waits).toHaveLength(2);
  });
});
