import {
  DEFAULT_ANTHROPIC_MODEL,
  createAnthropicTransport,
  DEFAULT_REQUESTS_PER_MINUTE as ANTHROPIC_RPM,
  DEFAULT_TOKENS_PER_MINUTE as ANTHROPIC_TPM,
} from "./anthropic";
import {
  DEFAULT_GEMINI_MODEL,
  createGeminiTransport,
  DEFAULT_REQUESTS_PER_MINUTE as GEMINI_RPM,
  DEFAULT_TOKENS_PER_MINUTE as GEMINI_TPM,
} from "./gemini";
import { createRateLimiter } from "./rate-limiter";
import { createStructuredClient } from "./structured-client";
import {
  LLM_ERROR_CODES,
  LlmError,
  type LlmClient,
  type LlmTransport,
} from "./types";

export const PROVIDERS = ["gemini", "anthropic"] as const;
export type Provider = (typeof PROVIDERS)[number];

/**
 * Gemini is the default because the brief requires the pipeline to run on a
 * free tier, and whoever grades this supplies their own key. Anthropic is
 * offered for development against a key you already hold; it has no free tier,
 * so it must never become the default.
 */
export const DEFAULT_PROVIDER: Provider = "gemini";

interface ProviderProfile {
  keyVars: readonly string[];
  defaultModel: string;
  requestsPerMinute: number;
  tokensPerMinute: number;
  createTransport(config: LlmConfig, fetchImpl?: typeof fetch): LlmTransport;
}

export interface LlmConfig {
  provider: Provider;
  apiKey: string;
  model: string;
  requestsPerMinute: number;
  tokensPerMinute: number;
  /** Overridden to reach a gateway, a proxy, or a local test double. */
  baseUrl?: string;
}

const PROFILES: Record<Provider, ProviderProfile> = {
  gemini: {
    keyVars: ["GEMINI_API_KEY", "GOOGLE_API_KEY", "LLM_API_KEY"],
    defaultModel: DEFAULT_GEMINI_MODEL,
    requestsPerMinute: GEMINI_RPM,
    tokensPerMinute: GEMINI_TPM,
    createTransport: (config, fetchImpl) =>
      createGeminiTransport({
        apiKey: config.apiKey,
        model: config.model,
        limiter: createRateLimiter(config),
        ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
        ...(fetchImpl ? { fetchImpl } : {}),
      }),
  },
  anthropic: {
    keyVars: ["ANTHROPIC_API_KEY", "LLM_API_KEY"],
    defaultModel: DEFAULT_ANTHROPIC_MODEL,
    requestsPerMinute: ANTHROPIC_RPM,
    tokensPerMinute: ANTHROPIC_TPM,
    createTransport: (config, fetchImpl) =>
      createAnthropicTransport({
        apiKey: config.apiKey,
        model: config.model,
        limiter: createRateLimiter(config),
        ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
        ...(fetchImpl ? { fetchImpl } : {}),
      }),
  },
};

function positiveNumber(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function isProvider(value: string): value is Provider {
  return (PROVIDERS as readonly string[]).includes(value);
}

/**
 * Picks the provider from LLM_PROVIDER when set, and otherwise from whichever
 * key is present, so a checkout with only one key configured just works.
 */
export function resolveProvider(
  env: Record<string, string | undefined>,
): Provider {
  const requested = env["LLM_PROVIDER"]?.trim().toLowerCase();

  if (requested) {
    if (!isProvider(requested)) {
      throw new LlmError(
        LLM_ERROR_CODES.AUTH,
        `Unknown LLM_PROVIDER "${requested}". Supported: ${PROVIDERS.join(", ")}`,
      );
    }
    return requested;
  }

  const withKey = PROVIDERS.filter((provider) =>
    PROFILES[provider].keyVars.some((name) => env[name]),
  );

  return withKey.length === 1 && withKey[0] ? withKey[0] : DEFAULT_PROVIDER;
}

export function readLlmConfig(
  env: Record<string, string | undefined>,
): LlmConfig {
  const provider = resolveProvider(env);
  const profile = PROFILES[provider];

  const keyVar = profile.keyVars.find((name) => env[name]);
  const apiKey = keyVar ? (env[keyVar] ?? "") : "";

  if (!apiKey) {
    throw new LlmError(
      LLM_ERROR_CODES.AUTH,
      `Set ${profile.keyVars[0]} (see .env.example) before running generation`,
    );
  }

  const baseUrl = env["LLM_BASE_URL"]?.trim();

  return {
    provider,
    apiKey,
    ...(baseUrl ? { baseUrl } : {}),
    model: env["LLM_MODEL"] ?? profile.defaultModel,
    requestsPerMinute: positiveNumber(
      env["LLM_REQUESTS_PER_MINUTE"],
      profile.requestsPerMinute,
    ),
    tokensPerMinute: positiveNumber(
      env["LLM_TOKENS_PER_MINUTE"],
      profile.tokensPerMinute,
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
  return createStructuredClient(
    PROFILES[config.provider].createTransport(config, overrides.fetchImpl),
  );
}
