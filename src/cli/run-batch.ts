import {
  PIPELINE_ERROR_CODES,
  toPipelineError,
} from "../core/pipeline/errors";
import type { KitPipelinePorts } from "../core/pipeline/ports";
import { runKit, type RunKitOptions } from "../core/pipeline/run-kit";
import { mapWithConcurrency, withTimeout } from "../core/util/async";
import type { BatchCase, ParsedCases } from "./cases";
import {
  buildReport,
  failedEntry,
  okEntry,
  type BatchEntry,
  type BatchReport,
} from "./report";

export interface RunBatchOptions {
  cases: ParsedCases;
  ports: KitPipelinePorts;
  concurrency: number;
  caseTimeoutMs: number;
  now?: () => Date;
  runOptions?: Omit<RunKitOptions, "now" | "deadlineAt">;
  onCaseSettled?: (entry: BatchEntry) => void;
}

async function runCase(
  batchCase: BatchCase,
  options: RunBatchOptions,
  now: () => Date,
): Promise<BatchEntry> {
  try {
    const result = await withTimeout(
      runKit(
        {
          jd: batchCase.jd,
          companyUrl: batchCase.company_url,
          days: batchCase.days,
        },
        options.ports,
        {
          ...options.runOptions,
          now,
          deadlineAt: Date.now() + options.caseTimeoutMs,
        },
      ),
      options.caseTimeoutMs,
      `Case ${batchCase.id}`,
    );
    return okEntry(batchCase.id, result.kit);
  } catch (cause) {
    const error = toPipelineError(cause);
    return failedEntry(batchCase.id, error.code, error.message);
  }
}

/**
 * One entry per input case. A case that throws, times out, or produces a kit
 * that fails validation is recorded as failed; the run itself never aborts.
 */
export async function runBatch(options: RunBatchOptions): Promise<BatchReport> {
  const now = options.now ?? (() => new Date());

  const produced = await mapWithConcurrency(
    options.cases.valid,
    options.concurrency,
    async (batchCase) => {
      const entry = await runCase(batchCase, options, now);
      options.onCaseSettled?.(entry);
      return entry;
    },
  );

  const rejected = options.cases.invalid.map((invalid) => {
    const entry = failedEntry(
      invalid.id,
      PIPELINE_ERROR_CODES.INVALID_CASE,
      invalid.message,
    );
    options.onCaseSettled?.(entry);
    return entry;
  });

  return buildReport([...produced, ...rejected], now());
}
