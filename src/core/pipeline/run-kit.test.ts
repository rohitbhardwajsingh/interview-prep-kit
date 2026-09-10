import { describe, expect, it } from "vitest";
import { PIPELINE_ERROR_CODES, PipelineError } from "./errors";
import { runKit } from "./run-kit";
import { createFakePorts } from "../testing/fake-ports";
import { buildQuestion, buildRequirement } from "../testing/builders";
import type { KitRequest } from "./ports";

const request: KitRequest = {
  jd: "Senior Backend Engineer. 5+ years with Go.",
  companyUrl: "http://localhost:8099/acme/",
  days: 3,
};

describe("runKit", () => {
  it("produces a kit that reports the posting it came from", async () => {
    const result = await runKit(
      request,
      createFakePorts({
        requirements: [buildRequirement("r1")],
        questionsByPass: [[buildQuestion("q1", ["r1"])]],
      }),
    );

    expect(result.kit.source.jd_chars).toBe(request.jd.length);
    expect(result.kit.source.company_url).toBe(request.companyUrl);
    expect(result.kit.schedule.days).toHaveLength(3);
  });

  it("stops after one pass when the first draft covers every must-have", async () => {
    const ports = createFakePorts({
      requirements: [buildRequirement("r1")],
      questionsByPass: [[buildQuestion("q1", ["r1"])]],
    });

    const result = await runKit(request, ports);

    expect(result.passes).toBe(1);
    expect(ports.calls.generateQuestions).toHaveLength(1);
    expect(result.kit.coverage.uncovered_requirement_ids).toEqual([]);
  });

  it("runs a second pass that closes an uncovered must-have", async () => {
    const ports = createFakePorts({
      requirements: [buildRequirement("r1"), buildRequirement("r2")],
      questionsByPass: [
        [buildQuestion("q1", ["r1"])],
        [buildQuestion("q2", ["r2"])],
      ],
    });

    const result = await runKit(request, ports);

    expect(result.passes).toBe(2);
    expect(result.kit.coverage.passes).toBe(2);
    expect(result.kit.coverage.uncovered_requirement_ids).toEqual([]);
  });

  it("targets only the uncovered requirements on the second pass", async () => {
    const ports = createFakePorts({
      requirements: [buildRequirement("r1"), buildRequirement("r2")],
      questionsByPass: [
        [buildQuestion("q1", ["r1"])],
        [buildQuestion("q2", ["r2"])],
      ],
    });

    await runKit(request, ports);

    expect(
      ports.calls.generateQuestions[1]?.requirements.map((item) => item.id),
    ).toEqual(["r2"]);
    expect(
      ports.calls.generateQuestions[1]?.existingQuestions.map((item) => item.id),
    ).toEqual(["q1"]);
  });

  it("gives every pass the full requirement id set to validate against", async () => {
    const ports = createFakePorts({
      requirements: [buildRequirement("r1"), buildRequirement("r2")],
      questionsByPass: [
        [buildQuestion("q1", ["r1"])],
        [buildQuestion("q2", ["r2"])],
      ],
    });

    await runKit(request, ports);

    for (const call of ports.calls.generateQuestions) {
      expect(call.allRequirementIds).toEqual(["r1", "r2"]);
    }
  });

  it("does not loop for an uncovered nice-to-have", async () => {
    const ports = createFakePorts({
      requirements: [
        buildRequirement("r1"),
        buildRequirement("r2", { priority: "nice" }),
      ],
      questionsByPass: [[buildQuestion("q1", ["r1"])]],
    });

    const result = await runKit(request, ports);

    expect(result.passes).toBe(1);
    expect(result.kit.coverage.uncovered_requirement_ids).toEqual(["r2"]);
  });

  it("stops early when a pass closes nothing", async () => {
    const ports = createFakePorts({
      requirements: [buildRequirement("r1"), buildRequirement("r2")],
      questionsByPass: [[buildQuestion("q1", ["r1"])], []],
    });

    const result = await runKit(request, ports, { maxCoveragePasses: 5 });

    expect(ports.calls.generateQuestions).toHaveLength(2);
    expect(result.kit.coverage.uncovered_requirement_ids).toEqual(["r2"]);
  });

  it("records a gap honestly rather than failing when the cap is reached", async () => {
    const ports = createFakePorts({
      requirements: [
        buildRequirement("r1"),
        buildRequirement("r2"),
        buildRequirement("r3"),
      ],
      questionsByPass: [
        [buildQuestion("q1", ["r1"])],
        [buildQuestion("q2", ["r2"])],
      ],
    });

    const result = await runKit(request, ports, { maxCoveragePasses: 2 });

    expect(result.passes).toBe(2);
    expect(result.kit.coverage.uncovered_requirement_ids).toEqual(["r3"]);
    expect(result.trace.map((entry) => entry.step)).toContain(
      "UNSCHEDULED_MUST_REQUIREMENT",
    );
  });

  it("rejects a kit whose questions reference requirements that do not exist", async () => {
    const ports = createFakePorts({
      requirements: [],
      questionsByPass: [[buildQuestion("q1", ["r-ghost"])]],
    });

    await expect(runKit(request, ports)).rejects.toMatchObject({
      code: PIPELINE_ERROR_CODES.KIT_INVALID,
    });
  });

  it("surfaces a failing step as a pipeline error", async () => {
    await expect(
      runKit(request, createFakePorts({ failOn: "research" })),
    ).rejects.toBeInstanceOf(Error);
  });

  it("traces the steps in the order they ran", async () => {
    const result = await runKit(
      request,
      createFakePorts({
        requirements: [buildRequirement("r1")],
        questionsByPass: [[buildQuestion("q1", ["r1"])]],
      }),
    );

    expect(result.trace.map((entry) => entry.step)).toEqual([
      "extract-role",
      "research-company",
      "generate-questions",
      "generate-flashcards",
      "allocate-schedule",
      "validate-kit",
    ]);
  });

  it("runs a distinct public-discussion step when the port supports it", async () => {
    const result = await runKit(
      request,
      createFakePorts({
        requirements: [buildRequirement("r1")],
        questionsByPass: [[buildQuestion("q1", ["r1"])]],
        publicDiscussion: ["A candidate reported a take-home then a system design round."],
      }),
    );

    expect(result.trace.map((entry) => entry.step)).toContain(
      "search-public-discussion",
    );
  });

  it("treats a failing public-discussion search as empty, never fatal", async () => {
    const result = await runKit(
      request,
      createFakePorts({
        requirements: [buildRequirement("r1")],
        questionsByPass: [[buildQuestion("q1", ["r1"])]],
        publicDiscussion: ["ignored"],
        failOn: "findPublicDiscussion",
      }),
    );

    // The run still completes and the step is recorded, honestly, as empty.
    expect(result.kit.questions).toHaveLength(1);
    const step = result.trace.find(
      (entry) => entry.step === "search-public-discussion",
    );
    expect(step?.detail).toContain("no public discussion");
  });

  it("produces a structurally valid kit from a posting with nothing to extract", async () => {
    const result = await runKit(
      { ...request, jd: "Frontend Engineer. React.", days: 1 },
      createFakePorts(),
    );

    expect(result.kit.role.requirements).toEqual([]);
    expect(result.kit.schedule.days).toHaveLength(1);
  });
});

describe("PipelineError", () => {
  it("carries a code the batch report can record", () => {
    const error = new PipelineError(
      PIPELINE_ERROR_CODES.COMPANY_UNREACHABLE,
      "unreachable",
    );

    expect(error.code).toBe("COMPANY_UNREACHABLE");
  });
});
