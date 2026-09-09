import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_REQUESTS_PER_MINUTE,
  DEFAULT_TOKENS_PER_MINUTE,
  createGeminiTransport,
} from "./gemini";
import { createRateLimiter } from "./rate-limiter";
import { createStructuredClient } from "./structured-client";
import { LLM_ERROR_CODES, LlmError, type LlmClient } from "./types";

export interface LlmConfig {
  apiKey: string;
  model: string;
  requestsPerMinute: number;
  tokensPerMinute: number;
}

function positiveNumber(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function readLlmConfig(env: Record<string, string | undefined>): LlmConfig {
  const apiKey = env["GEMINI_API_KEY"] ?? env["LLM_API_KEY"] ?? "";
  if (!apiKey) {
    throw new LlmError(
      LLM_ERROR_CODES.AUTH,
      "Set GEMINI_API_KEY (see .env.example) before running generation",
    );
  }

  return {
    apiKey,
    model: env["LLM_MODEL"] ?? DEFAULT_GEMINI_MODEL,
    requestsPerMinute: positiveNumber(
      env["LLM_REQUESTS_PER_MINUTE"],
      DEFAULT_REQUESTS_PER_MINUTE,
    ),
    tokensPerMinute: positiveNumber(
      env["LLM_TOKENS_PER_MINUTE"],
      DEFAULT_TOKENS_PER_MINUTE,
    ),
  };
}

/**
 * One client per process, so every case in a batch run draws from the same
 * per-minute budget instead of each assuming it has the whole allowance.
 */
export function createLlmClient(
  config: LlmConfig,
  overrides: { fetchImpl?: typeof fetch } = {},
): LlmClient {
  const limiter = createRateLimiter({
    requestsPerMinute: config.requestsPerMinute,
    tokensPerMinute: config.tokensPerMinute,
  });

  return createStructuredClient(
    createGeminiTransport({
      apiKey: config.apiKey,
      model: config.model,
      limiter,
      ...(overrides.fetchImpl ? { fetchImpl: overrides.fetchImpl } : {}),
    }),
  );
}
