export class TimeoutError extends Error {
  override name = "TimeoutError";

  constructor(label: string, readonly timeoutMs: number) {
    super(`${label} exceeded ${timeoutMs}ms`);
  }
}

export function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;

  const expiry = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, timeoutMs)), timeoutMs);
  });

  return Promise.race([operation, expiry]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

/**
 * Runs `worker` over `items` with a bounded number in flight, preserving input
 * order in the results. Concurrency is capped because every case shares one
 * provider rate limit.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const effectiveLimit = Math.max(1, Math.min(limit, items.length));
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function drain(): Promise<void> {
    for (;;) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (index >= items.length || item === undefined) return;
      results[index] = await worker(item, index);
    }
  }

  await Promise.all(
    Array.from({ length: effectiveLimit }, () => drain()),
  );

  return results;
}
