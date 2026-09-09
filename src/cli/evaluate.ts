import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createLlmPorts } from "../core/generation/llm-ports";
import { createLlmClient, readLlmConfig } from "../core/llm/create-client";
import { LlmError } from "../core/llm/types";
import { allowPrivateHostsFromEnv } from "../core/retrieval/url-guard";
import { ArgumentError, EVALUATE_USAGE, parseEvaluateArgs } from "./args";
import { CasesFileError, parseCasesFile } from "./cases";
import { loadDotEnv } from "./env";
import { runBatch } from "./run-batch";

async function main(): Promise<number> {
  loadDotEnv();
  const args = parseEvaluateArgs(process.argv.slice(2), process.env);
  const inputPath = resolve(args.inputPath);
  const outputPath = resolve(args.outputPath);

  const cases = parseCasesFile(await readFile(inputPath, "utf8"));
  const total = cases.valid.length + cases.invalid.length;

  // One client for the whole run, so all cases share the per-minute budget.
  const config = readLlmConfig(process.env);
  const ports = createLlmPorts({
    llm: createLlmClient(config),
    allowPrivateHosts: allowPrivateHostsFromEnv(process.env),
  });

  console.log(
    `Running ${total} case(s) from ${inputPath} with concurrency ${args.concurrency}`,
  );
  console.log(`Model: ${config.provider}/${config.model}`);

  const startedAt = Date.now();
  let settled = 0;

  const report = await runBatch({
    cases,
    ports,
    concurrency: args.concurrency,
    caseTimeoutMs: args.caseTimeoutMs,
    onCaseSettled: (entry) => {
      settled += 1;
      const detail = entry.error ? ` (${entry.error.code})` : "";
      console.log(`  [${settled}/${total}] ${entry.id}: ${entry.status}${detail}`);
    },
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const failed = report.kits.filter((entry) => entry.status === "failed").length;
  const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `Wrote ${report.kits.length} result(s) to ${outputPath} in ${elapsedSeconds}s (${failed} failed)`,
  );

  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((cause: unknown) => {
    if (cause instanceof ArgumentError) {
      console.error(`${cause.message}\n${EVALUATE_USAGE}`);
    } else if (cause instanceof CasesFileError) {
      console.error(cause.message);
    } else if (cause instanceof LlmError) {
      // A misconfigured key is the likeliest first-run failure, and a stack
      // trace would bury the one line that fixes it.
      console.error(cause.message);
    } else {
      console.error(cause instanceof Error ? cause.stack : String(cause));
    }
    process.exitCode = 1;
  });
