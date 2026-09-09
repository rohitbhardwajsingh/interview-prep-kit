import {
  createHttpTransport,
  type ProviderAdapter,
  type HttpTransportOptions,
} from "./http-transport";
import type { RateLimiter } from "./rate-limiter";
import {
  LLM_ERROR_CODES,
  LlmError,
  type LlmTransport,
  type TransportRequest,
} from "./types";

/** The most capable model a key reaches without billing enabled. */
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
export const DEFAULT_GEMINI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta";

/**
 * The free tier's own published ceiling. There is also a daily request cap,
 * which no per-minute limiter can spend its way around: a run that exhausts it
 * fails the remaining cases with RATE_LIMITED rather than silently degrading.
 */
export const DEFAULT_REQUESTS_PER_MINUTE = 10;
export const DEFAULT_TOKENS_PER_MINUTE = 200_000;

export interface GeminiTransportOptions
  extends Omit<HttpTransportOptions, "adapter"> {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  limiter?: RateLimiter;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  usageMetadata?: { totalTokenCount?: number };
  error?: { code?: number; message?: string; details?: unknown[] };
}

export function createGeminiAdapter(options: {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}): ProviderAdapter {
  const model = options.model ?? DEFAULT_GEMINI_MODEL;
  const baseUrl = options.baseUrl ?? DEFAULT_GEMINI_BASE_URL;

  if (!options.apiKey) {
    throw new LlmError(LLM_ERROR_CODES.AUTH, "No API key was configured");
  }

  return {
    provider: "gemini",
    model,
    endpoint: `${baseUrl}/models/${model}:generateContent`,

    headers: () => ({
      "content-type": "application/json",
      "x-goog-api-key": options.apiKey,
    }),

    body: (request: TransportRequest) => ({
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

    textOf: (raw) =>
      ((raw as GeminiResponse).candidates?.[0]?.content?.parts ?? [])
        .map((part) => part.text ?? "")
        .join(""),

    totalTokensOf: (raw) =>
      (raw as GeminiResponse).usageMetadata?.totalTokenCount ?? null,

    classify: (status, raw) => {
      const message = (raw as GeminiResponse).error?.message ?? `HTTP ${status}`;

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
    },

    // Gemini advertises a wait inside the error details, as "5s".
    retryAfterMs: (_status, raw) => {
      const details = (raw as GeminiResponse).error?.details;
      if (!Array.isArray(details)) return null;

      for (const detail of details) {
        if (!detail || typeof detail !== "object") continue;
        const { retryDelay } = detail as { retryDelay?: unknown };
        if (typeof retryDelay !== "string") continue;
        const seconds = Number.parseFloat(retryDelay);
        if (Number.isFinite(seconds)) return Math.round(seconds * 1000);
      }

      return null;
    },
  };
}

export function createGeminiTransport(
  options: GeminiTransportOptions,
): LlmTransport {
  const { apiKey, model, baseUrl, ...transport } = options;

  return createHttpTransport({
    ...transport,
    requestsPerMinute: options.requestsPerMinute ?? DEFAULT_REQUESTS_PER_MINUTE,
    tokensPerMinute: options.tokensPerMinute ?? DEFAULT_TOKENS_PER_MINUTE,
    adapter: createGeminiAdapter({
      apiKey,
      ...(model === undefined ? {} : { model }),
      ...(baseUrl === undefined ? {} : { baseUrl }),
    }),
  });
}
