import { createRateLimiter, type RateLimiter } from "./rate-limiter";
import {
  LLM_ERROR_CODES,
  LlmError,
  type LlmTransport,
  type TransportRequest,
  type TransportResponse,
} from "./types";

export const DEFAULT_ATTEMPTS = 4;
export const DEFAULT_BACKOFF_MS = 1_000;
export const DEFAULT_TIMEOUT_MS = 45_000;

/**
 * Everything that differs between providers. Anything absent from this
 * interface is shared, so adding a provider cannot change retry behaviour.
 */
export interface ProviderAdapter {
  readonly provider: string;
  readonly model: string;
  readonly endpoint: string;
  headers(): Record<string, string>;
  body(request: TransportRequest): unknown;
  /** Concatenated text of a successful response, or "" when there is none. */
  textOf(body: unknown): string;
  totalTokensOf(body: unknown): number | null;
  classify(status: number, body: unknown): LlmError;
  /** A delay the provider asked us to wait, in milliseconds. */
  retryAfterMs?(status: number, body: unknown, headers: Headers): number | null;
}

export interface HttpTransportOptions {
  adapter: ProviderAdapter;
  limiter?: RateLimiter;
  requestsPerMinute?: number;
  tokensPerMinute?: number;
  maxAttempts?: number;
  backoffMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exponential, with jitter so concurrent cases do not retry in lockstep. */
export function backoffFor(attempt: number, base: number): number {
  return base * 2 ** (attempt - 1) + Math.floor(Math.random() * base);
}

function asLlmError(cause: unknown): LlmError {
  if (cause instanceof LlmError) return cause;

  const aborted =
    cause instanceof Error &&
    (cause.name === "TimeoutError" || cause.name === "AbortError");

  return new LlmError(
    aborted ? LLM_ERROR_CODES.TIMEOUT : LLM_ERROR_CODES.TRANSPORT,
    cause instanceof Error ? cause.message : String(cause),
    { cause, retryable: true },
  );
}

/**
 * The provider-agnostic half of a transport: spend the rate-limit budget, make
 * one HTTP call, and retry what is worth retrying. It knows nothing about
 * prompts or schemas, and nothing about any particular provider's wire format.
 */
export function createHttpTransport(options: HttpTransportOptions): LlmTransport {
  const { adapter } = options;
  const maxAttempts = options.maxAttempts ?? DEFAULT_ATTEMPTS;
  const backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const limiter =
    options.limiter ??
    createRateLimiter({
      requestsPerMinute: options.requestsPerMinute ?? 10,
      tokensPerMinute: options.tokensPerMinute ?? 200_000,
    });

  async function attempt(request: TransportRequest): Promise<TransportResponse> {
    const response = await fetchImpl(adapter.endpoint, {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: adapter.headers(),
      body: JSON.stringify(adapter.body(request)),
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = adapter.classify(response.status, body);
      const delay = adapter.retryAfterMs?.(
        response.status,
        body,
        response.headers,
      );
      if (delay !== null && delay !== undefined) {
        Object.defineProperty(error, "retryAfterMs", { value: delay });
      }
      throw error;
    }

    return {
      text: adapter.textOf(body),
      totalTokens: adapter.totalTokensOf(body),
    };
  }

  return {
    model: adapter.model,

    async send(request: TransportRequest): Promise<TransportResponse> {
      let lastError: LlmError | null = null;

      for (let tries = 1; tries <= maxAttempts; tries += 1) {
        await limiter.acquire(request.estimatedTokens);

        try {
          return await attempt(request);
        } catch (cause) {
          const error = asLlmError(cause);
          lastError = error;
          if (!error.retryable || tries === maxAttempts) throw error;

          const advertised = (error as { retryAfterMs?: number }).retryAfterMs;
          await sleep(advertised ?? backoffFor(tries, backoffMs));
        }
      }

      throw (
        lastError ??
        new LlmError(
          LLM_ERROR_CODES.TRANSPORT,
          `${adapter.provider} request failed`,
        )
      );
    },
  };
}
