import { describe, expect, it } from "vitest";
import { DEFAULT_ANTHROPIC_MODEL } from "./anthropic";
import {
  DEFAULT_PROVIDER,
  createLlmClient,
  readLlmConfig,
  resolveProvider,
} from "./create-client";
import { DEFAULT_GEMINI_MODEL } from "./gemini";

describe("resolveProvider", () => {
  it("defaults to the free-tier provider when nothing is configured", () => {
    expect(resolveProvider({})).toBe("gemini");
    expect(DEFAULT_PROVIDER).toBe("gemini");
  });

  it("honours an explicit choice", () => {
    expect(resolveProvider({ LLM_PROVIDER: "anthropic" })).toBe("anthropic");
  });

  it("accepts an explicit choice in any casing", () => {
    expect(resolveProvider({ LLM_PROVIDER: " Anthropic " })).toBe("anthropic");
  });

  it("rejects an unknown provider by name", () => {
    expect(() => resolveProvider({ LLM_PROVIDER: "llama" })).toThrow(
      /Unknown LLM_PROVIDER "llama". Supported: gemini, anthropic/,
    );
  });

  it("infers the provider when exactly one key is present", () => {
    expect(resolveProvider({ ANTHROPIC_API_KEY: "sk-ant" })).toBe("anthropic");
    expect(resolveProvider({ GEMINI_API_KEY: "goog" })).toBe("gemini");
  });

  it("falls back to the default when both keys are present", () => {
    expect(
      resolveProvider({ ANTHROPIC_API_KEY: "sk-ant", GEMINI_API_KEY: "goog" }),
    ).toBe("gemini");
  });

  it("does not infer from the shared key variable alone", () => {
    expect(resolveProvider({ LLM_API_KEY: "either" })).toBe("gemini");
  });
});

describe("readLlmConfig", () => {
  it("names the provider's own key variable when no key is set", () => {
    expect(() => readLlmConfig({ LLM_PROVIDER: "anthropic" })).toThrow(
      /Set ANTHROPIC_API_KEY/,
    );
    expect(() => readLlmConfig({})).toThrow(/Set GEMINI_API_KEY/);
  });

  it("applies each provider's own model default", () => {
    expect(readLlmConfig({ GEMINI_API_KEY: "goog" }).model).toBe(
      DEFAULT_GEMINI_MODEL,
    );
    expect(readLlmConfig({ ANTHROPIC_API_KEY: "sk-ant" }).model).toBe(
      DEFAULT_ANTHROPIC_MODEL,
    );
  });

  it("applies each provider's own rate limits", () => {
    const gemini = readLlmConfig({ GEMINI_API_KEY: "goog" });
    const anthropic = readLlmConfig({ ANTHROPIC_API_KEY: "sk-ant" });

    expect(gemini.tokensPerMinute).not.toBe(anthropic.tokensPerMinute);
    expect(gemini.tokensPerMinute).toBeGreaterThan(0);
    expect(anthropic.tokensPerMinute).toBeGreaterThan(0);
  });

  it("lets an override win over the provider default", () => {
    const config = readLlmConfig({
      GEMINI_API_KEY: "goog",
      LLM_MODEL: "gemini-2.5-flash",
      LLM_REQUESTS_PER_MINUTE: "3",
      LLM_TOKENS_PER_MINUTE: "50000",
    });

    expect(config.model).toBe("gemini-2.5-flash");
    expect(config.requestsPerMinute).toBe(3);
    expect(config.tokensPerMinute).toBe(50_000);
  });

  it("ignores a nonsense limit rather than disabling the limiter", () => {
    const config = readLlmConfig({
      GEMINI_API_KEY: "goog",
      LLM_REQUESTS_PER_MINUTE: "not-a-number",
      LLM_TOKENS_PER_MINUTE: "-5",
    });

    expect(config.requestsPerMinute).toBeGreaterThan(0);
    expect(config.tokensPerMinute).toBeGreaterThan(0);
  });

  it("reads the shared key variable when a provider-specific one is absent", () => {
    expect(
      readLlmConfig({ LLM_PROVIDER: "anthropic", LLM_API_KEY: "shared" }).apiKey,
    ).toBe("shared");
  });
});

describe("createLlmClient", () => {
  it("builds a client that reports the configured model", () => {
    for (const env of [
      { GEMINI_API_KEY: "goog" },
      { ANTHROPIC_API_KEY: "sk-ant" },
    ]) {
      const config = readLlmConfig(env);
      expect(createLlmClient(config).model).toBe(config.model);
    }
  });

  it("reaches the endpoint belonging to the chosen provider", async () => {
    const seen: string[] = [];

    const fetchImpl: typeof fetch = async (url) => {
      seen.push(String(url));
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "{}" }] } }],
          content: [{ type: "text", text: "{}" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    for (const env of [
      { GEMINI_API_KEY: "goog" },
      { ANTHROPIC_API_KEY: "sk-ant" },
    ]) {
      const client = createLlmClient(readLlmConfig(env), { fetchImpl });
      await client.complete({
        name: "probe",
        instructions: "Return an object.",
        task: "Return {}.",
        schema: (await import("zod")).z.object({}).passthrough(),
      });
    }

    expect(seen[0]).toContain("generativelanguage.googleapis.com");
    expect(seen[1]).toBe("https://api.anthropic.com/v1/messages");
  });
});
