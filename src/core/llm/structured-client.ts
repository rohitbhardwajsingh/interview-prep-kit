import { parseJsonLoosely } from "./json";
import { renderPrompt, renderSystemInstruction } from "./prompt";
import { estimateRequestTokens } from "./tokens";
import {
  LLM_ERROR_CODES,
  LlmError,
  type LlmClient,
  type LlmTransport,
  type StructuredRequest,
} from "./types";

export const DEFAULT_EXPECTED_OUTPUT_TOKENS = 1_500;
export const DEFAULT_REPAIR_ATTEMPTS = 1;

export interface StructuredClientOptions {
  /** Extra attempts allowed after an unusable response, with the fault fed back. */
  repairAttempts?: number;
  expectedOutputTokens?: number;
  onCall?: (event: {
    name: string;
    attempt: number;
    totalTokens: number | null;
  }) => void;
}

const JSON_ONLY_RULE =
  "Reply with a single JSON value and nothing else. No prose, no code fence, no explanation.";

/**
 * Provider-agnostic half of the client: builds the prompt, spends the token
 * budget, parses the reply and validates it against the caller's schema. A
 * reply that cannot be used is retried once with the specific fault quoted
 * back, which is cheaper than failing the whole case.
 */
export function createStructuredClient(
  transport: LlmTransport,
  options: StructuredClientOptions = {},
): LlmClient {
  const repairAttempts = options.repairAttempts ?? DEFAULT_REPAIR_ATTEMPTS;
  const expectedOutputTokens =
    options.expectedOutputTokens ?? DEFAULT_EXPECTED_OUTPUT_TOKENS;

  return {
    model: transport.model,

    async complete<T>(request: StructuredRequest<T>): Promise<T> {
      const systemInstruction = renderSystemInstruction(
        `${request.instructions}\n\n${JSON_ONLY_RULE}`,
      );

      let correction = "";
      let lastError: LlmError | null = null;

      for (let attempt = 1; attempt <= repairAttempts + 1; attempt += 1) {
        const prompt = renderPrompt({
          task: correction ? `${request.task}\n\n${correction}` : request.task,
          ...(request.documents ? { documents: request.documents } : {}),
        });

        const response = await transport.send({
          systemInstruction,
          prompt,
          temperature: request.temperature ?? 0,
          ...(request.maxOutputTokens === undefined
            ? {}
            : { maxOutputTokens: request.maxOutputTokens }),
          estimatedTokens: estimateRequestTokens(
            systemInstruction,
            prompt,
            request.maxOutputTokens ?? expectedOutputTokens,
          ),
        });

        options.onCall?.({
          name: request.name,
          attempt,
          totalTokens: response.totalTokens,
        });

        if (response.text.trim().length === 0) {
          lastError = new LlmError(
            LLM_ERROR_CODES.EMPTY_RESPONSE,
            `${request.name} returned an empty response`,
            { retryable: true },
          );
          correction =
            "Your previous reply was empty. Reply with the JSON value only.";
          continue;
        }

        let payload: unknown;
        try {
          payload = parseJsonLoosely(response.text);
        } catch (cause) {
          lastError = new LlmError(
            LLM_ERROR_CODES.UNPARSEABLE_JSON,
            `${request.name} did not return JSON`,
            { cause, retryable: true },
          );
          correction =
            "Your previous reply was not valid JSON. Reply with the JSON value only, with no surrounding text.";
          continue;
        }

        const parsed = request.schema.safeParse(payload);
        if (parsed.success) return parsed.data;

        const faults = parsed.error.issues
          .slice(0, 8)
          .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
          .join("; ");

        lastError = new LlmError(
          LLM_ERROR_CODES.SCHEMA_MISMATCH,
          `${request.name} returned JSON that does not match the expected shape: ${faults}`,
          { retryable: true },
        );
        correction = `Your previous reply had the wrong shape. Fix exactly these problems and reply with the corrected JSON only: ${faults}`;
      }

      throw (
        lastError ??
        new LlmError(
          LLM_ERROR_CODES.EMPTY_RESPONSE,
          `${request.name} produced no usable response`,
        )
      );
    },
  };
}
