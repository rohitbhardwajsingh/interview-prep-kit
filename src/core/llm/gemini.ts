import { createRateLimiter, type RateLimiter } from "./rate-limiter";
import {
  LLM_ERROR_CODES,
  LlmError,
  type LlmTransport,
  type TransportRequest,
  type TransportResponse,
} from "./types";

export const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash";
export const DEFAULT_GEMINI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta";

/** Conservative against the free tier; raise via env once a key's real limits
 *  are known. Being throttled costs a retry, so the default under-claims. */
export const DEFAULT_REQUESTS_PER_MINUTE = 10;
export const DEFAULT_TOKENS_PER_MINUTE = 200_000;

export const DEFAULT_ATTEMPTS = 4;
export const DEFAULT_BACKOFF_MS = 1_000;
export const DEFAULT_TIMEOUT_MS = 45_000;

export interface GeminiTransportOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  limiter?: RateLimiter;
  maxAttempts?: number;
  backoffMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

interface GeminiCandidate {
  content?: { parts?: Array<{ text?: string }> };
  finishReason?: string;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: { totalTokenCount?: number };
  error?: { code?: number; message?: string; status?: string };
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffFor(attempt: number, base: number): number {
  return base * 2 ** (attempt - 1) + Math.floor(Math.random() * base);
}

function retryDelayFrom(body: GeminiResponse): number | null {
  const details = (body as { error?: { details?: unknown[] } }).error?.details;
  if (!Array.isArray(details)) return null;

  for (const detail of details) {
    if (!detail || typeof detail !== "object") continue;
    const { retryDelay } = detail as { retryDelay?: unknown };
    if (typeof retryDelay !== "string") continue;
    const seconds = Number.parseFloat(retryDelay);
    if (Number.isFinite(seconds)) return Math.round(seconds * 1000);
  }

  return null;
}

function textOf(body: GeminiResponse): string {
  return (body.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("");
}

function classify(status: number, body: GeminiResponse): LlmError {
  const message = body.error?.message ?? `HTTP ${status}`;

  if (status === 401 || status === 403) {
    return new LlmError(LLM_ERROR_CODES.AUTH, message);
  }
  if (status === 429) {
    return new LlmError(LLM_ERROR_CODES.RATE_LIMITED, message, {
      retryable: true,
    });
  }
  return new LlmError(LLM_ERROR_CODES.TRANSPORT, message, {
    retryable: status >= 500,
  });
}

/**
 * Gemini's half of the client: one HTTP call, the provider's rate limits, and
 * retrying what is worth retrying. It knows nothing about prompts or schemas.
 */
export function createGeminiTransport(
  options: GeminiTransportOptions,
): LlmTransport {
  const model = options.model ?? DEFAULT_GEMINI_MODEL;
  const baseUrl = options.baseUrl ?? DEFAULT_GEMINI_BASE_URL;
  const maxAttempts = options.maxAttempts ?? DEFAULT_ATTEMPTS;
  const backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const limiter =
    options.limiter ??
    createRateLimiter({
      requestsPerMinute: DEFAULT_REQUESTS_PER_MINUTE,
      tokensPerMinute: DEFAULT_TOKENS_PER_MINUTE,
    });

  if (!options.apiKey) {
    throw new LlmError(LLM_ERROR_CODES.AUTH, "No API key was configured");
  }

  const endpoint = `${baseUrl}/models/${model}:generateContent`;

  async function attempt(request: TransportRequest): Promise<TransportResponse> {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": options.apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: request.systemInstruction }] },
        contents: [{ role: "user", parts: [{ text: request.prompt }] }],
        generationConfig: {
          temperature: request.temperature,
          responseMimeType: "application/json",
          ...(request.maxOutputTokens === undefined
            ? {}
            : { maxOutputTokens: request.maxOutputTokens }),
        },
      }),
    });

    const body = (await response.json().catch(() => ({}))) as GeminiResponse;

    if (!response.ok) {
      const error = classify(response.status, body);
      const delay = retryDelayFrom(body);
      if (delay !== null) {
        Object.defineProperty(error, "retryAfterMs", { value: delay });
      }
      throw error;
    }

    return {
      text: textOf(body),
      totalTokens: body.usageMetadata?.totalTokenCount ?? null,
    };
  }

  return {
    model,

    async send(request: TransportRequest): Promise<TransportResponse> {
      let lastError: LlmError | null = null;

      for (let tries = 1; tries <= maxAttempts; tries += 1) {
        await limiter.acquire(request.estimatedTokens);

        try {
          return await attempt(request);
        } catch (cause) {
          const error =
            cause instanceof LlmError
              ? cause
              : new LlmError(
                  cause instanceof Error &&
                  (cause.name === "TimeoutError" || cause.name === "AbortError")
                    ? LLM_ERROR_CODES.TIMEOUT
                    : LLM_ERROR_CODES.TRANSPORT,
                  cause instanceof Error ? cause.message : String(cause),
                  { cause, retryable: true },
                );

          lastError = error;
          if (!error.retryable || tries === maxAttempts) throw error;

          const advertised = (error as { retryAfterMs?: number }).retryAfterMs;
          await sleep(advertised ?? backoffFor(tries, backoffMs));
        }
      }

      throw lastError ?? new LlmError(LLM_ERROR_CODES.TRANSPORT, "Request failed");
    },
  };
}
