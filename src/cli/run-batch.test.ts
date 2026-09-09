import { describe, expect, it } from "vitest";
import { runBatch } from "./run-batch";
import { parseCases } from "./cases";
import { BATCH_REPORT_VERSION } from "./report";
import { createFakePorts } from "../core/testing/fake-ports";
import { buildQuestion, buildRequirement } from "../core/testing/builders";

const workingPorts = () =>
  createFakePorts({
    requirements: [buildRequirement("r1")],
    questionsByPass: [[buildQuestion("q1", ["r1"])]],
  });

function casesFrom(entries: unknown[]) {
  return parseCases(entries);
}

const goodCase = {
  id: "case-01",
  jd: "Senior Backend Engineer",
  company_url: "http://localhost:8099/acme/",
  days: 5,
};

describe("runBatch", () => {
  it("writes the Appendix B envelope", async () => {
    const report = await runBatch({
      cases: casesFrom([goodCase]),
      ports: workingPorts(),
      concurrency: 2,
      caseTimeoutMs: 5_000,
    });

    expect(report.version).toBe(BATCH_REPORT_VERSION);
    expect(report.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(report.kits).toHaveLength(1);
    expect(report.kits[0]).toMatchObject({
      id: "case-01",
      status: "ok",
      error: null,
    });
    expect(report.kits[0]?.kit).not.toBeNull();
  });

  it("emits one entry per input case", async () => {
    const report = await runBatch({
      cases: casesFrom([
        goodCase,
        { ...goodCase, id: "case-02" },
        { ...goodCase, id: "case-03" },
      ]),
      ports: workingPorts(),
      concurrency: 2,
      caseTimeoutMs: 5_000,
    });

    expect(report.kits.map((entry) => entry.id)).toEqual([
      "case-01",
      "case-02",
      "case-03",
    ]);
  });

  it("keeps going after a case fails and records the failure", async () => {
    const report = await runBatch({
      cases: casesFrom([goodCase, { ...goodCase, id: "case-02" }]),
      ports: createFakePorts({ failOn: "research" }),
      concurrency: 1,
      caseTimeoutMs: 5_000,
    });

    expect(report.kits).toHaveLength(2);
    for (const entry of report.kits) {
      expect(entry.status).toBe("failed");
      expect(entry.kit).toBeNull();
      expect(entry.error?.code).toBe("UNKNOWN");
    }
  });

  it("mixes successes and failures in one run", async () => {
    let attempt = 0;
    const ports = workingPorts();
    const flaky = {
      ...ports,
      async research(...args: Parameters<typeof ports.research>) {
        attempt += 1;
        if (attempt === 2) throw new Error("site down");
        return ports.research(...args);
      },
    };

    const report = await runBatch({
      cases: casesFrom([goodCase, { ...goodCase, id: "case-02" }]),
      ports: flaky,
      concurrency: 1,
      caseTimeoutMs: 5_000,
    });

    expect(report.kits.map((entry) => entry.status)).toEqual(["ok", "failed"]);
  });

  it("records a case that runs past its deadline as a timeout", async () => {
    const report = await runBatch({
      cases: casesFrom([goodCase]),
      ports: createFakePorts({ delayMs: 200 }),
      concurrency: 1,
      caseTimeoutMs: 20,
    });

    expect(report.kits[0]?.status).toBe("failed");
    expect(report.kits[0]?.error?.code).toBe("TIMEOUT");
  });

  it("records a malformed case without attempting to run it", async () => {
    const report = await runBatch({
      cases: casesFrom([goodCase, { id: "case-bad", jd: "x", days: 0 }]),
      ports: workingPorts(),
      concurrency: 2,
      caseTimeoutMs: 5_000,
    });

    const bad = report.kits.find((entry) => entry.id === "case-bad");
    expect(bad?.status).toBe("failed");
    expect(bad?.error?.code).toBe("INVALID_CASE");
    expect(report.kits.find((entry) => entry.id === "case-01")?.status).toBe("ok");
  });

  it("uses each case's own day count", async () => {
    const report = await runBatch({
      cases: casesFrom([
        { ...goodCase, id: "short", days: 1 },
        { ...goodCase, id: "long", days: 30 },
      ]),
      ports: workingPorts(),
      concurrency: 2,
      caseTimeoutMs: 5_000,
    });

    const byId = new Map(report.kits.map((entry) => [entry.id, entry]));
    expect(byId.get("short")?.kit?.schedule.days).toHaveLength(1);
    expect(byId.get("long")?.kit?.schedule.days).toHaveLength(30);
  });
});
