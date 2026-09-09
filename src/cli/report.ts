import type { Kit } from "../core/kit/schema";
import type { PipelineErrorCode } from "../core/pipeline/errors";

export const BATCH_REPORT_VERSION = "1.0";

export interface BatchEntryError {
  code: PipelineErrorCode;
  message: string;
}

export interface BatchEntry {
  id: string;
  status: "ok" | "failed";
  kit: Kit | null;
  error: BatchEntryError | null;
}

export interface BatchReport {
  version: string;
  generated_at: string;
  kits: BatchEntry[];
}

export function okEntry(id: string, kit: Kit): BatchEntry {
  return { id, status: "ok", kit, error: null };
}

export function failedEntry(
  id: string,
  code: PipelineErrorCode,
  message: string,
): BatchEntry {
  return { id, status: "failed", kit: null, error: { code, message } };
}

export function buildReport(
  entries: readonly BatchEntry[],
  generatedAt: Date,
): BatchReport {
  return {
    version: BATCH_REPORT_VERSION,
    generated_at: generatedAt.toISOString(),
    kits: [...entries],
  };
}
