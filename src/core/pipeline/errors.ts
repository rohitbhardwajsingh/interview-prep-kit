import { LlmError } from "../llm/types";
import { TimeoutError } from "../util/async";

export const PIPELINE_ERROR_CODES = {
  INVALID_CASE: "INVALID_CASE",
  COMPANY_UNREACHABLE: "COMPANY_UNREACHABLE",
  EXTRACTION_FAILED: "EXTRACTION_FAILED",
  GENERATION_FAILED: "GENERATION_FAILED",
  KIT_INVALID: "KIT_INVALID",
  TIMEOUT: "TIMEOUT",
  UNKNOWN: "UNKNOWN",
} as const;

export type PipelineErrorCode =
  (typeof PIPELINE_ERROR_CODES)[keyof typeof PIPELINE_ERROR_CODES];

export class PipelineError extends Error {
  override name = "PipelineError";

  constructor(
    readonly code: PipelineErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export function toPipelineError(cause: unknown): PipelineError {
  if (cause instanceof PipelineError) return cause;
  if (cause instanceof TimeoutError) {
    return new PipelineError(PIPELINE_ERROR_CODES.TIMEOUT, cause.message, { cause });
  }
  // The provider's own code travels in the message, so a report distinguishes a
  // bad key from a rate limit without needing a second error taxonomy.
  if (cause instanceof LlmError) {
    return new PipelineError(
      PIPELINE_ERROR_CODES.GENERATION_FAILED,
      `${cause.code}: ${cause.message}`,
      { cause },
    );
  }
  const message = cause instanceof Error ? cause.message : String(cause);
  return new PipelineError(PIPELINE_ERROR_CODES.UNKNOWN, message, { cause });
}
