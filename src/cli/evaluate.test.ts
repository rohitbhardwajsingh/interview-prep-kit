import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { validateKit } from "../core/kit/validate";
import {
  startFakeProvider,
  type FakeProvider,
} from "../core/testing/fake-provider";
import {
  startFixtureServer,
  type FixtureServer,
} from "../core/testing/fixture-server";
import type { BatchReport } from "./report";

const run = promisify(execFile);
const REPO = resolve(import.meta.dirname, "../..");

let site: FixtureServer;
let provider: FakeProvider;
let workDir: string;

beforeAll(async () => {
  [site, provider] = await Promise.all([
    startFixtureServer(),
    startFakeProvider(),
  ]);
  workDir = await mkdtemp(join(tmpdir(), "prepkit-cli-"));
}, 30_000);

afterAll(async () => {
  await Promise.all([site.close(), provider.close()]);
});

interface EvaluateOutcome {
  stdout: string;
  stderr: string;
  code: number;
}

async function evaluate(
  args: readonly string[],
  env: Record<string, string> = {},
): Promise<EvaluateOutcome> {
  try {
    const { stdout, stderr } = await run(
      "npx",
      ["tsx", "src/cli/evaluate.ts", ...args],
      {
        cwd: REPO,
        env: {
          ...process.env,
          GEMINI_API_KEY: "fake-key",
          LLM_PROVIDER: "gemini",
          LLM_BASE_URL: provider.baseUrl,
          ALLOW_PRIVATE_HOSTS: "true",
          ...env,
        },
      },
    );
    return { stdout, stderr, code: 0 };
  } catch (cause) {
    const error = cause as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
      code: error.code ?? 1,
    };
  }
}

async function writeCases(name: string, cases: unknown): Promise<string> {
  const path = join(workDir, name);
  await writeFile(path, JSON.stringify(cases), "utf8");
  return path;
}

async function readReport(path: string): Promise<BatchReport> {
  return JSON.parse(await readFile(path, "utf8")) as BatchReport;
}

const JD = [
  "Senior Backend Engineer",
  "",
  "You will own our routing service. Strong Go, production Kubernetes and",
  "Postgres at scale are required. Mentoring is a plus.",
].join("\n");

describe("npm run evaluate", () => {
  it("turns a file of cases into a file of kits", async () => {
    const input = await writeCases("cases.json", [
      { id: "case-01", jd: JD, company_url: `${site.origin}/acme/`, days: 5 },
    ]);
    const output = join(workDir, "kits.json");

    const outcome = await evaluate([
      "--input",
      input,
      "--output",
      output,
    ]);

    expect(outcome.code).toBe(0);
    const report = await readReport(output);
    expect(report.kits).toHaveLength(1);
    expect(report.kits[0]?.status).toBe("ok");
  }, 60_000);

  it("produces a kit that passes the validator", async () => {
    const input = await writeCases("valid.json", [
      { id: "case-01", jd: JD, company_url: `${site.origin}/acme/`, days: 5 },
    ]);
    const output = join(workDir, "valid-kits.json");

    await evaluate(["--input", input, "--output", output]);
    const report = await readReport(output);

    expect(validateKit(report.kits[0]?.kit).ok).toBe(true);
  }, 60_000);

  it("gives the schedule exactly the days the case asked for", async () => {
    const input = await writeCases("days.json", [
      { id: "short", jd: JD, company_url: `${site.origin}/acme/`, days: 1 },
      { id: "long", jd: JD, company_url: `${site.origin}/acme/`, days: 30 },
    ]);
    const output = join(workDir, "days-kits.json");

    await evaluate(["--input", input, "--output", output]);
    const report = await readReport(output);

    const byId = new Map(report.kits.map((entry) => [entry.id, entry]));
    expect(byId.get("short")?.kit?.schedule.days).toHaveLength(1);
    expect(byId.get("long")?.kit?.schedule.days).toHaveLength(30);
  }, 90_000);

  it("records a malformed case as failed and still finishes the rest", async () => {
    const input = await writeCases("mixed.json", [
      { id: "good", jd: JD, company_url: `${site.origin}/acme/`, days: 3 },
      { id: "bad", jd: "", company_url: "not-a-url", days: 0 },
    ]);
    const output = join(workDir, "mixed-kits.json");

    const outcome = await evaluate(["--input", input, "--output", output]);
    const report = await readReport(output);

    expect(outcome.code).toBe(0);
    const byId = new Map(report.kits.map((entry) => [entry.id, entry]));
    expect(byId.get("good")?.status).toBe("ok");
    expect(byId.get("bad")?.status).toBe("failed");
  }, 60_000);

  it("produces an honest empty brief for a site it cannot read", async () => {
    const input = await writeCases("blocked.json", [
      { id: "blocked", jd: JD, company_url: `${site.origin}/blocked/`, days: 3 },
    ]);
    const output = join(workDir, "blocked-kits.json");

    await evaluate(["--input", input, "--output", output]);
    const report = await readReport(output);

    const kit = report.kits[0]?.kit;
    expect(report.kits[0]?.status).toBe("ok");
    expect(kit?.company_brief.summary).toBe("");
    expect(kit?.company_brief.sources).toEqual([]);
  }, 60_000);

  it("explains a missing key in one line rather than a stack trace", async () => {
    const input = await writeCases("nokey.json", []);
    const output = join(workDir, "nokey-kits.json");

    const outcome = await evaluate(["--input", input, "--output", output], {
      GEMINI_API_KEY: "",
      LLM_API_KEY: "",
      ANTHROPIC_API_KEY: "",
    });

    expect(outcome.code).toBe(1);
    expect(outcome.stderr).toContain("GEMINI_API_KEY");
    expect(outcome.stderr).not.toContain("at ");
  }, 60_000);

  it("refuses to run without both paths", async () => {
    const outcome = await evaluate(["--input", "only-one.json"]);

    expect(outcome.code).toBe(1);
    expect(outcome.stderr).toContain("required");
  }, 60_000);
});
