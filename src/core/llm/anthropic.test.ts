import { describe, expect, it } from "vitest";
import {
  ANTHROPIC_VERSION,
  DEFAULT_MAX_OUTPUT_TOKENS,
  createAnthropicTransport,
} from "./anthropic";
import { UNLIMITED } from "./rate-limiter";
import { LLM_ERROR_CODES } from "./types";

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function reply(text: string, inputTokens = 400, outputTokens = 112): unknown {
  return {
    content: [{ type: "text", text }],
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
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
  return createAnthropicTransport({
    apiKey: "test-key",
    limiter: UNLIMITED,
    fetchImpl,
    sleep: async () => {},
    ...overrides,
  });
}

async function bodyOf(fetchCall: () => Promise<unknown>, capture: () => unknown) {
  await fetchCall();
  return capture();
}

describe("createAnthropicTransport", () => {
  it("refuses to build without a key", () => {
    expect(() => createAnthropicTransport({ apiKey: "" })).toThrow(
      /No API key was configured/,
    );
  });

  it("returns the reply text and the summed token count", async () => {
    const transport = transportWith(async () =>
      jsonResponse(reply('{"a":1}', 700, 31)),
    );

    expect(await transport.send(request)).toEqual({
      text: '{"a":1}',
      totalTokens: 731,
    });
  });

  it("sends the key and API version as headers", async () => {
    let seenUrl = "";
    let headers = new Headers();

    const transport = transportWith(async (url, init) => {
      seenUrl = String(url);
      headers = new Headers(init?.headers);
      return jsonResponse(reply("{}"));
    });

    await transport.send(request);

    expect(seenUrl).toBe("https://api.anthropic.com/v1/messages");
    expect(headers.get("x-api-key")).toBe("test-key");
    expect(headers.get("anthropic-version")).toBe(ANTHROPIC_VERSION);
    expect(seenUrl).not.toContain("test-key");
  });

  it("puts our instructions in the system field, not the user turn", async () => {
    let sent: Record<string, unknown> = {};

    const transport = transportWith(async (_url, init) => {
      sent = JSON.parse(String(init?.body));
      return jsonResponse(reply("{}"));
    });

    await transport.send(request);

    expect(sent["system"]).toBe("You extract requirements.");
    expect(sent["messages"]).toEqual([
      { role: "user", content: "<task>Extract</task>" },
    ]);
  });

  it("always sends max_tokens, which the Messages API requires", async () => {
    let sent: Record<string, unknown> = {};

    const transport = transportWith(async (_url, init) => {
      sent = JSON.parse(String(init?.body));
      return jsonResponse(reply("{}"));
    });

    await transport.send(request);

    expect(sent["max_tokens"]).toBe(DEFAULT_MAX_OUTPUT_TOKENS);
  });

  it("lets a caller's output ceiling win over the default", async () => {
    let sent: Record<string, unknown> = {};

    const transport = transportWith(async (_url, init) => {
      sent = JSON.parse(String(init?.body));
      return jsonResponse(reply("{}"));
    });

    await transport.send({ ...request, maxOutputTokens: 256 });

    expect(sent["max_tokens"]).toBe(256);
  });

  it("keeps only text blocks, ignoring other content types", async () => {
    const transport = transportWith(async () =>
      jsonResponse({
        content: [
          { type: "thinking", thinking: "ignore me" },
          { type: "text", text: '{"a":' },
          { type: "text", text: "1}" },
        ],
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    );

    expect((await transport.send(request)).text).toBe('{"a":1}');
  });

  it("reports a missing key as auth and does not retry it", async () => {
    let calls = 0;

    const transport = transportWith(async () => {
      calls += 1;
      return jsonResponse(
        { error: { type: "authentication_error", message: "invalid x-api-key" } },
        401,
      );
    });

    await expect(transport.send(request)).rejects.toMatchObject({
      code: LLM_ERROR_CODES.AUTH,
    });
    expect(calls).toBe(1);
  });

  it("retries a throttled request and succeeds", async () => {
    let calls = 0;

    const transport = transportWith(async () => {
      calls += 1;
      if (calls === 1) {
        return jsonResponse(
          { error: { type: "rate_limit_error", message: "slow down" } },
          429,
        );
      }
      return jsonResponse(reply('{"ok":true}'));
    });

    expect((await transport.send(request)).text).toBe('{"ok":true}');
    expect(calls).toBe(2);
  });

  it("waits the retry-after header rather than its own backoff", async () => {
    const waits: number[] = [];
    let calls = 0;

    const transport = transportWith(
      async () => {
        calls += 1;
        if (calls === 1) {
          return jsonResponse({ error: { message: "slow down" } }, 429, {
            "retry-after": "7",
          });
        }
        return jsonResponse(reply("{}"));
      },
      {
        sleep: async (ms: number) => {
          waits.push(ms);
        },
      },
    );

    await transport.send(request);

    expect(waits).toEqual([7_000]);
  });

  it("retries a 529 overloaded response", async () => {
    let calls = 0;

    const transport = transportWith(async () => {
      calls += 1;
      if (calls < 3) {
        return jsonResponse(
          { error: { type: "overloaded_error", message: "overloaded" } },
          529,
        );
      }
      return jsonResponse(reply("{}"));
    });

    await transport.send(request);

    expect(calls).toBe(3);
  });

  it("does not retry a request the provider rejected as malformed", async () => {
    let calls = 0;

    const transport = transportWith(async () => {
      calls += 1;
      return jsonResponse(
        { error: { type: "invalid_request_error", message: "bad model" } },
        400,
      );
    });

    await expect(transport.send(request)).rejects.toMatchObject({
      code: LLM_ERROR_CODES.TRANSPORT,
    });
    expect(calls).toBe(1);
  });

  it("gives up after the attempt limit and reports the last fault", async () => {
    let calls = 0;

    const transport = transportWith(
      async () => {
        calls += 1;
        return jsonResponse({ error: { message: "still overloaded" } }, 503);
      },
      { maxAttempts: 3 },
    );

    await expect(transport.send(request)).rejects.toMatchObject({
      code: LLM_ERROR_CODES.TRANSPORT,
      message: "still overloaded",
    });
    expect(calls).toBe(3);
  });

  it("reports a token count of null when usage is absent", async () => {
    const transport = transportWith(async () =>
      jsonResponse({ content: [{ type: "text", text: "{}" }] }),
    );

    expect((await transport.send(request)).totalTokens).toBeNull();
  });

  it("spends the shared token budget before each attempt", async () => {
    const spent: number[] = [];
    let calls = 0;

    const transport = transportWith(async () => {
      calls += 1;
      if (calls === 1) {
        return jsonResponse({ error: { message: "slow down" } }, 429);
      }
      return jsonResponse(reply("{}"));
    }, {
      limiter: {
        acquire: async (tokens: number) => {
          spent.push(tokens);
        },
      },
    });

    await transport.send(request);

    expect(spent).toEqual([400, 400]);
  });
});
