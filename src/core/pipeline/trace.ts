export type TraceStatus = "ok" | "skipped" | "failed";

export interface TraceEntry {
  step: string;
  status: TraceStatus;
  detail: string;
  duration_ms: number;
}

/**
 * A record of which pipeline steps ran, in order, and what each produced. It
 * backs the progress feed in the interface and doubles as the evidence that
 * generation is sequenced rather than a single call.
 */
export class RunTrace {
  private readonly entries: TraceEntry[] = [];

  async step<T>(
    name: string,
    run: () => Promise<T>,
    describe?: (value: T) => string,
  ): Promise<T> {
    const startedAt = Date.now();
    try {
      const value = await run();
      this.entries.push({
        step: name,
        status: "ok",
        detail: describe?.(value) ?? "",
        duration_ms: Date.now() - startedAt,
      });
      return value;
    } catch (cause) {
      this.entries.push({
        step: name,
        status: "failed",
        detail: cause instanceof Error ? cause.message : String(cause),
        duration_ms: Date.now() - startedAt,
      });
      throw cause;
    }
  }

  skip(name: string, detail: string): void {
    this.entries.push({ step: name, status: "skipped", detail, duration_ms: 0 });
  }

  snapshot(): TraceEntry[] {
    return this.entries.map((entry) => ({ ...entry }));
  }
}
