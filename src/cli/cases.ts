import { z } from "zod";

export const batchCaseSchema = z
  .object({
    id: z.string().min(1),
    jd: z.string(),
    company_url: z.string().min(1),
    days: z.number().int().min(1),
  })
  .passthrough();

export type BatchCase = z.infer<typeof batchCaseSchema>;

export interface InvalidCase {
  id: string;
  message: string;
}

export interface ParsedCases {
  valid: BatchCase[];
  invalid: InvalidCase[];
}

export class CasesFileError extends Error {
  override name = "CasesFileError";
}

function fallbackId(entry: unknown, index: number): string {
  if (entry && typeof entry === "object" && "id" in entry) {
    const { id } = entry as { id?: unknown };
    if (typeof id === "string" && id.length > 0) return id;
  }
  return `case-at-index-${index}`;
}

/**
 * A malformed individual case is recorded and skipped; only a malformed file
 * aborts the run, because there is nothing to iterate over.
 */
export function parseCases(input: unknown): ParsedCases {
  if (!Array.isArray(input)) {
    throw new CasesFileError("Input file must contain a JSON array of cases");
  }

  const valid: BatchCase[] = [];
  const invalid: InvalidCase[] = [];
  const seenIds = new Set<string>();

  input.forEach((entry, index) => {
    const id = fallbackId(entry, index);
    const parsed = batchCaseSchema.safeParse(entry);

    if (!parsed.success) {
      invalid.push({
        id,
        message: parsed.error.issues
          .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
          .join("; "),
      });
      return;
    }

    if (seenIds.has(parsed.data.id)) {
      invalid.push({ id, message: `Duplicate case id "${parsed.data.id}"` });
      return;
    }

    seenIds.add(parsed.data.id);
    valid.push(parsed.data);
  });

  return { valid, invalid };
}

export function parseCasesFile(raw: string): ParsedCases {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new CasesFileError(
      `Input file is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
  return parseCases(parsed);
}
