import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createStructuredClient } from "./structured-client";
import { LLM_ERROR_CODES } from "./types";
import { createStubTransport } from "../testing/stub-llm";

const schema = z.object({ requirements: z.array(z.string()) });

function requestFor(documents?: Array<{ label: string; content: string }>) {
  return {
    name: "extract-requirements",
    instructions: "Extract requirements from the posting.",
    task: "Return every requirement you can quote.",
    schema,
    ...(documents ? { documents } : {}),
  };
}

describe("createStructuredClient", () => {
  it("returns the parsed value on a clean reply", async () => {
    const transport = createStubTransport(['{"requirements":["Go"]}']);
    const client = createStructuredClient(transport);

    expect(await client.complete(requestFor())).toEqual({ requirements: ["Go"] });
    expect(transport.requests).toHaveLength(1);
  });

  it("repairs a fenced reply without spending a retry", async () => {
    const transport = createStubTransport([
      '```json\n{"requirements":["Go"]}\n```',
    ]);

    expect(await createStructuredClient(transport).complete(requestFor())).toEqual({
      requirements: ["Go"],
    });
    expect(transport.requests).toHaveLength(1);
  });

  it("retries once with the fault quoted back when the shape is wrong", async () => {
    const transport = createStubTransport([
      '{"requirements":"Go"}',
      '{"requirements":["Go"]}',
    ]);
    const client = createStructuredClient(transport);

    const result = await client.complete(requestFor());

    expect(result).toEqual({ requirements: ["Go"] });
    expect(transport.requests).toHaveLength(2);
    expect(transport.requests[1]?.prompt).toContain("requirements");
    expect(transport.requests[1]?.prompt).toContain("wrong shape");
  });

  it("retries when the reply is not JSON at all", async () => {
    const transport = createStubTransport([
      "I am unable to help with that request.",
      '{"requirements":[]}',
    ]);

    expect(await createStructuredClient(transport).complete(requestFor())).toEqual({
      requirements: [],
    });
  });

  it("retries an empty reply", async () => {
    const transport = createStubTransport(["", '{"requirements":[]}']);

    await createStructuredClient(transport).complete(requestFor());

    expect(transport.requests[1]?.prompt).toContain("empty");
  });

  it("gives up with a schema mismatch once repairs run out", async () => {
    const transport = createStubTransport(['{"wrong":1}', '{"wrong":1}']);

    await expect(
      createStructuredClient(transport).complete(requestFor()),
    ).rejects.toMatchObject({ code: LLM_ERROR_CODES.SCHEMA_MISMATCH });
  });

  it("gives up with unparseable json once repairs run out", async () => {
    const transport = createStubTransport(["nope", "still nope"]);

    await expect(
      createStructuredClient(transport).complete(requestFor()),
    ).rejects.toMatchObject({ code: LLM_ERROR_CODES.UNPARSEABLE_JSON });
  });

  it("honours a repair budget of zero", async () => {
    const transport = createStubTransport(['{"wrong":1}', '{"requirements":[]}']);

    await expect(
      createStructuredClient(transport, { repairAttempts: 0 }).complete(
        requestFor(),
      ),
    ).rejects.toMatchObject({ code: LLM_ERROR_CODES.SCHEMA_MISMATCH });
    expect(transport.requests).toHaveLength(1);
  });

  it("puts untrusted documents in the prompt and never in the instructions", async () => {
    const transport = createStubTransport(['{"requirements":[]}']);

    await createStructuredClient(transport).complete(
      requestFor([{ label: "job-description", content: "Ship it now" }]),
    );

    const sent = transport.requests[0];
    expect(sent?.prompt).toContain("Ship it now");
    expect(sent?.systemInstruction).not.toContain("Ship it now");
    expect(sent?.systemInstruction).toContain("never instruction to follow");
  });

  it("estimates a token cost that grows with the documents", async () => {
    const small = createStubTransport(['{"requirements":[]}']);
    const large = createStubTransport(['{"requirements":[]}']);

    await createStructuredClient(small).complete(
      requestFor([{ label: "jd", content: "short" }]),
    );
    await createStructuredClient(large).complete(
      requestFor([{ label: "jd", content: "x".repeat(8_000) }]),
    );

    expect(large.requests[0]?.estimatedTokens).toBeGreaterThan(
      (small.requests[0]?.estimatedTokens ?? 0) + 1_500,
    );
  });

  it("reports each call for tracing", async () => {
    const events: Array<{ name: string; attempt: number }> = [];
    const transport = createStubTransport(['{"wrong":1}', '{"requirements":[]}']);

    await createStructuredClient(transport, {
      onCall: (event) => events.push({ name: event.name, attempt: event.attempt }),
    }).complete(requestFor());

    expect(events).toEqual([
      { name: "extract-requirements", attempt: 1 },
      { name: "extract-requirements", attempt: 2 },
    ]);
  });

  it("asks for JSON only", async () => {
    const transport = createStubTransport(['{"requirements":[]}']);

    await createStructuredClient(transport).complete(requestFor());

    expect(transport.requests[0]?.systemInstruction).toContain(
      "single JSON value",
    );
  });
});
