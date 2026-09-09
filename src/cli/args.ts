export const DEFAULT_CONCURRENCY = 2;
export const DEFAULT_CASE_TIMEOUT_MS = 170_000;

export interface EvaluateArgs {
  inputPath: string;
  outputPath: string;
  concurrency: number;
  caseTimeoutMs: number;
}

export class ArgumentError extends Error {
  override name = "ArgumentError";
}

export const EVALUATE_USAGE =
  "Usage: npm run evaluate -- --input <cases.json> --output <kits.json> [--concurrency <n>] [--case-timeout-ms <n>]";

function readFlags(argv: readonly string[]): Map<string, string> {
  const flags = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) continue;

    const equalsAt = token.indexOf("=");
    if (equalsAt !== -1) {
      flags.set(token.slice(2, equalsAt), token.slice(equalsAt + 1));
      continue;
    }

    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      throw new ArgumentError(`Flag ${token} expects a value`);
    }
    flags.set(token.slice(2), next);
    index += 1;
  }

  return flags;
}

function positiveInteger(
  raw: string | undefined,
  fallback: number,
  label: string,
): number {
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new ArgumentError(`${label} must be a positive integer, received "${raw}"`);
  }
  return value;
}

export function parseEvaluateArgs(
  argv: readonly string[],
  env: Record<string, string | undefined> = {},
): EvaluateArgs {
  const flags = readFlags(argv);
  const inputPath = flags.get("input");
  const outputPath = flags.get("output");

  if (!inputPath || !outputPath) {
    throw new ArgumentError(`Both --input and --output are required. ${EVALUATE_USAGE}`);
  }

  return {
    inputPath,
    outputPath,
    concurrency: positiveInteger(
      flags.get("concurrency") ?? env["EVALUATE_CONCURRENCY"],
      DEFAULT_CONCURRENCY,
      "concurrency",
    ),
    caseTimeoutMs: positiveInteger(
      flags.get("case-timeout-ms") ?? env["CASE_TIMEOUT_MS"],
      DEFAULT_CASE_TIMEOUT_MS,
      "case-timeout-ms",
    ),
  };
}
