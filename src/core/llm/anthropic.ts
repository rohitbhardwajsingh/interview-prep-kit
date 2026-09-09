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

export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-5";
export const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";
export const ANTHROPIC_VERSION = "2023-06-01";

/** The Messages API requires an output ceiling, unlike Gemini. */
export const DEFAULT_MAX_OUTPUT_TOKENS = 8_192;

export const DEFAULT_REQUESTS_PER_MINUTE = 50;
export const DEFAULT_TOKENS_PER_MINUTE = 30_000;

/** Anthropic returns 529 when the whole service is saturated. */
const OVERLOADED = 529;

export interface AnthropicTransportOptions
  extends Omit<HttpTransportOptions, "adapter"> {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  maxOutputTokens?: number;
  limiter?: RateLimiter;
}

interface AnthropicResponse {
  content?: Array<{ type?: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { type?: string; message?: string };
}

export function createAnthropicAdapter(options: {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  maxOutputTokens?: number;
}): ProviderAdapter {
  const model = options.model ?? DEFAULT_ANTHROPIC_MODEL;
  const baseUrl = options.baseUrl ?? DEFAULT_ANTHROPIC_BASE_URL;
  const ceiling = options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;

  if (!options.apiKey) {
    throw new LlmError(LLM_ERROR_CODES.AUTH, "No API key was configured");
  }

  return {
    provider: "anthropic",
    model,
    endpoint: `${baseUrl}/messages`,

    headers: () => ({
      "content-type": "application/json",
      "x-api-key": options.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    }),

    // The Messages API has no JSON response mode, so JSON is asked for in the
    // instructions and enforced downstream by the structured client's parse,
    // validate and repair loop, which every provider goes through anyway.
    body: (request: TransportRequest) => ({
      model,
      max_tokens: request.maxOutputTokens ?? ceiling,
      temperature: request.temperature,
      system: request.systemInstruction,
      messages: [{ role: "user", content: request.prompt }],
    }),

    textOf: (raw) =>
      ((raw as AnthropicResponse).content ?? [])
        .filter((block) => block.type === "text")
        .map((block) => block.text ?? "")
        .join(""),

    totalTokensOf: (raw) => {
      const usage = (raw as AnthropicResponse).usage;
      if (!usage) return null;
      const input = usage.input_tokens ?? 0;
      const output = usage.output_tokens ?? 0;
      return input + output;
    },

    classify: (status, raw) => {
      const message =
        (raw as AnthropicResponse).error?.message ?? `HTTP ${status}`;

      if (status === 401 || status === 403) {
        return new LlmError(LLM_ERROR_CODES.AUTH, message);
      }
      if (status === 429) {
        return new LlmError(LLM_ERROR_CODES.RATE_LIMITED, message, {
          retryable: true,
        });
      }
      return new LlmError(LLM_ERROR_CODES.TRANSPORT, message, {
        retryable: status >= 500 || status === OVERLOADED,
      });
    },

    // Anthropic advertises a wait in the standard header, in whole seconds.
    retryAfterMs: (_status, _raw, headers) => {
      const raw = headers.get("retry-after");
      if (!raw) return null;
      const seconds = Number.parseFloat(raw);
      return Number.isFinite(seconds) ? Math.round(seconds * 1000) : null;
    },
  };
}

export function createAnthropicTransport(
  options: AnthropicTransportOptions,
): LlmTransport {
  const { apiKey, model, baseUrl, maxOutputTokens, ...transport } = options;

  return createHttpTransport({
    ...transport,
    requestsPerMinute: options.requestsPerMinute ?? DEFAULT_REQUESTS_PER_MINUTE,
    tokensPerMinute: options.tokensPerMinute ?? DEFAULT_TOKENS_PER_MINUTE,
    adapter: createAnthropicAdapter({
      apiKey,
      ...(model === undefined ? {} : { model }),
      ...(baseUrl === undefined ? {} : { baseUrl }),
      ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
    }),
  });
}
