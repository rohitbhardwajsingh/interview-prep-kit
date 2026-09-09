import { describe, expect, it } from "vitest";
import { createGeminiTransport } from "./gemini";
import { UNLIMITED } from "./rate-limiter";
import { LLM_ERROR_CODES } from "./types";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function reply(text: string, totalTokenCount = 512): unknown {
  return {
    candidates: [{ content: { parts: [{ text }] } }],
    usageMetadata: { totalTokenCount },
  };
}

const request = {
  systemInstruction: "You extract requirements.",
  prompt: "<task>Extract</task>",
  temperature: 0,
  estimatedTokens: 400,
};

function transportWith(
  fetchImpl: typeof fetch,
  overrides: Record<string, unknown> = {},
) {
  return createGeminiTransport({
    apiKey: "test-key",
    limiter: UNLIMITED,
    fetchImpl,
    sleep: async () => {},
    ...overrides,
  });
}

describe("createGeminiTransport", () => {
  it("refuses to build without a key", () => {
    expect(() => createGeminiTransport({ apiKey: "" })).toThrow(
      /No API key was configured/,
    );
  });

  it("returns the reply text and the reported token count", async () => {
    const transport = transportWith(async () =>
      jsonResponse(reply('{"a":1}', 731)),
    );

    expect(await transport.send(request)).toEqual({
      text: '{"a":1}',
      totalTokens: 731,
    });
  });

  it("sends the key in a header rather than the query string", async () => {
    let seenUrl = "";
    let seenKey: string | null = null;

    const transport = transportWith(async (input, init) => {
      seenUrl = String(input);
      seenKey = new Headers(init?.headers).get("x-goog-api-key");
      return jsonResponse(reply("{}"));
    });
    await transport.send(request);

    expect(seenUrl).not.toContain("test-key");
    expect(seenKey).toBe("test-key");
  });

  it("asks for a JSON response and a deterministic temperature", async () => {
    let body: Record<string, unknown> = {};

    const transport = transportWith(async (_input, init) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return jsonResponse(reply("{}"));
    });
    await transport.send(request);

    expect(body["generationConfig"]).toMatchObject({
      responseMimeType: "application/json",
      temperature: 0,
    });
    expect(body["systemInstruction"]).toEqual({
      parts: [{ text: "You extract requirements." }],
    });
  });

  it("retries a rate limit and succeeds", async () => {
    let calls = 0;
    const transport = transportWith(async () => {
      calls += 1;
      return calls === 1
        ? jsonResponse({ error: { code: 429, message: "quota" } }, 429)
        : jsonResponse(reply("{}"));
    });

    await transport.send(request);

    expect(calls).toBe(2);
  });

  it("waits for the delay the provider advertises", async () => {
    const waits: number[] = [];
    let calls = 0;

    const transport = transportWith(
      async () => {
        calls += 1;
        return calls === 1
          ? jsonResponse(
              {
                error: {
                  code: 429,
                  message: "quota",
                  details: [{ retryDelay: "27s" }],
                },
              },
              429,
            )
          : jsonResponse(reply("{}"));
      },
      {
        sleep: async (ms: number) => {
          waits.push(ms);
        },
      },
    );

    await transport.send(request);

    expect(waits).toEqual([27_000]);
  });

  it("retries a server error", async () => {
    let calls = 0;
    const transport = transportWith(async () => {
      calls += 1;
      return calls < 3 ? jsonResponse({}, 503) : jsonResponse(reply("{}"));
    });

    await transport.send(request);

    expect(calls).toBe(3);
  });

  it("does not retry a bad key", async () => {
    let calls = 0;
    const transport = transportWith(async () => {
      calls += 1;
      return jsonResponse({ error: { code: 403, message: "denied" } }, 403);
    });

    await expect(transport.send(request)).rejects.toMatchObject({
      code: LLM_ERROR_CODES.AUTH,
    });
    expect(calls).toBe(1);
  });

  it("gives up after the attempt budget", async () => {
    let calls = 0;
    const transport = transportWith(
      async () => {
        calls += 1;
        return jsonResponse({ error: { code: 429, message: "quota" } }, 429);
      },
      { maxAttempts: 3 },
    );

    await expect(transport.send(request)).rejects.toMatchObject({
      code: LLM_ERROR_CODES.RATE_LIMITED,
    });
    expect(calls).toBe(3);
  });

  it("classifies a transport failure", async () => {
    const transport = transportWith(
      async () => {
        throw new Error("ECONNRESET");
      },
      { maxAttempts: 1 },
    );

    await expect(transport.send(request)).rejects.toMatchObject({
      code: LLM_ERROR_CODES.TRANSPORT,
    });
  });

  it("returns empty text when the model produced no parts", async () => {
    const transport = transportWith(async () => jsonResponse({ candidates: [{}] }));

    expect((await transport.send(request)).text).toBe("");
  });

  it("spends the token budget before each attempt", async () => {
    const reserved: number[] = [];
    let calls = 0;

    const transport = createGeminiTransport({
      apiKey: "k",
      limiter: {
        acquire: async (tokens: number) => {
          reserved.push(tokens);
        },
      },
      sleep: async () => {},
      fetchImpl: async () => {
        calls += 1;
        return calls === 1
          ? jsonResponse({ error: { code: 429 } }, 429)
          : jsonResponse(reply("{}"));
      },
    });

    await transport.send(request);

    expect(reserved).toEqual([400, 400]);
  });
});
