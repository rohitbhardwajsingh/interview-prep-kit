import type {
  LlmClient,
  LlmTransport,
  StructuredRequest,
  TransportRequest,
  TransportResponse,
} from "../llm/types";

export interface StubTransport extends LlmTransport {
  readonly requests: TransportRequest[];
}

/**
 * Replays a fixed script of raw replies, so the structured client's parsing,
 * validation and repair behaviour can be tested without a provider.
 */
export function createStubTransport(replies: readonly string[]): StubTransport {
  const requests: TransportRequest[] = [];
  let index = 0;

  return {
    model: "stub",
    requests,
    async send(request: TransportRequest): Promise<TransportResponse> {
      requests.push(request);
      const text = replies[index] ?? "";
      index += 1;
      return { text, totalTokens: 100 };
    },
  };
}

export interface StubLlmClient extends LlmClient {
  readonly calls: Array<StructuredRequest<unknown>>;
}

/**
 * Returns a canned value per request name, for testing layers above the client.
 */
export function createStubLlmClient(
  responses: Record<string, unknown>,
): StubLlmClient {
  const calls: Array<StructuredRequest<unknown>> = [];

  return {
    model: "stub",
    calls,
    async complete<T>(request: StructuredRequest<T>): Promise<T> {
      calls.push(request as StructuredRequest<unknown>);
      if (!(request.name in responses)) {
        throw new Error(`No stub response configured for "${request.name}"`);
      }
      return request.schema.parse(responses[request.name]);
    },
  };
}
