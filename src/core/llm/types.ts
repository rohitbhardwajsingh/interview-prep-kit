import type { z } from "zod";

export const LLM_ERROR_CODES = {
  AUTH: "AUTH",
  RATE_LIMITED: "RATE_LIMITED",
  TRANSPORT: "TRANSPORT",
  TIMEOUT: "TIMEOUT",
  EMPTY_RESPONSE: "EMPTY_RESPONSE",
  UNPARSEABLE_JSON: "UNPARSEABLE_JSON",
  SCHEMA_MISMATCH: "SCHEMA_MISMATCH",
} as const;

export type LlmErrorCode = (typeof LLM_ERROR_CODES)[keyof typeof LLM_ERROR_CODES];

export class LlmError extends Error {
  override name = "LlmError";

  constructor(
    readonly code: LlmErrorCode,
    message: string,
    options?: { cause?: unknown; retryable?: boolean },
  ) {
    super(message, options);
    this.retryable = options?.retryable ?? false;
  }

  readonly retryable: boolean;
}

/**
 * Content we did not write: the pasted job description and every crawled page.
 * It reaches a prompt only through this type, which is rendered as inert data.
 */
export interface UntrustedDocument {
  label: string;
  content: string;
}

export interface StructuredRequest<T> {
  /** Short name for traces and error messages. */
  name: string;
  /** Instructions we authored. Never contains untrusted text. */
  instructions: string;
  /** The specific ask for this call. Never contains untrusted text. */
  task: string;
  documents?: UntrustedDocument[];
  schema: z.ZodType<T>;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface LlmClient {
  readonly model: string;
  complete<T>(request: StructuredRequest<T>): Promise<T>;
}

export interface TransportRequest {
  systemInstruction: string;
  prompt: string;
  temperature: number;
  maxOutputTokens?: number;
  estimatedTokens: number;
}

export interface TransportResponse {
  text: string;
  totalTokens: number | null;
}

export interface LlmTransport {
  readonly model: string;
  send(request: TransportRequest): Promise<TransportResponse>;
}
