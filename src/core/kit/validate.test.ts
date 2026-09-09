import { describe, expect, it } from "vitest";
import { KIT_ISSUE_CODES, validateKit } from "./validate";
import {
  buildKit,
  buildQuestion,
  buildRequirement,
} from "../testing/builders";

function codesFor(input: unknown): string[] {
  return validateKit(input).issues.map((issue) => issue.code);
}

describe("validateKit", () => {
  it("accepts a well-formed kit", () => {
    const result = validateKit(buildKit());

    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.kit).not.toBeNull();
  });

  it("keeps extension fields that sit alongside the required ones", () => {
    const kit = { ...buildKit(), evidence: { r1: "5+ years with React" } };

    const result = validateKit(kit);

    expect(result.ok).toBe(true);
    expect(result.kit).toMatchObject({ evidence: { r1: "5+ years with React" } });
  });

  it("rejects a kit that is missing a required section", () => {
    const { coverage: _omitted, ...withoutCoverage } = buildKit();

    expect(codesFor(withoutCoverage)).toContain(KIT_ISSUE_CODES.SCHEMA);
  });

  it("rejects fractional minutes", () => {
    const kit = buildKit();
    const day = kit.schedule.days[0];
    if (day) day.minutes = 62.5;

    expect(codesFor(kit)).toContain(KIT_ISSUE_CODES.SCHEMA);
  });

  it("rejects a difficulty outside one to three", () => {
    const kit = buildKit();
    const question = kit.questions[0];
    if (question) question.difficulty = 4;

    expect(codesFor(kit)).toContain(KIT_ISSUE_CODES.SCHEMA);
  });

  it("rejects a priority the brief does not define", () => {
    const kit = buildKit();
    const requirement = kit.role.requirements[0];
    if (requirement) {
      (requirement as { priority: string }).priority = "optional";
    }

    expect(codesFor(kit)).toContain(KIT_ISSUE_CODES.SCHEMA);
  });

  it("flags a schedule that references a question which does not exist", () => {
    const kit = buildKit();
    const day = kit.schedule.days[0];
    if (day) day.question_ids = ["q-missing"];

    expect(codesFor(kit)).toContain(KIT_ISSUE_CODES.UNKNOWN_QUESTION_REFERENCE);
  });

  it("flags a question that references a requirement which does not exist", () => {
    const kit = buildKit();
    const question = kit.questions[0];
    if (question) question.requirement_ids = ["r-missing"];

    expect(codesFor(kit)).toContain(
      KIT_ISSUE_CODES.UNKNOWN_REQUIREMENT_REFERENCE,
    );
  });

  it("flags a schedule whose length does not match the days requested", () => {
    const kit = buildKit({ daysAvailable: 3 });
    kit.schedule.days = kit.schedule.days.slice(0, 2);

    expect(codesFor(kit)).toContain(KIT_ISSUE_CODES.SCHEDULE_LENGTH_MISMATCH);
  });

  it("flags days that are not numbered from one upwards", () => {
    const kit = buildKit();
    const day = kit.schedule.days[1];
    if (day) day.day = 7;

    expect(codesFor(kit)).toContain(KIT_ISSUE_CODES.SCHEDULE_DAY_SEQUENCE);
  });

  it("flags duplicate ids", () => {
    const kit = buildKit({
      requirements: [buildRequirement("r1"), buildRequirement("r1")],
      questions: [buildQuestion("q1", ["r1"])],
    });

    expect(codesFor(kit)).toContain(KIT_ISSUE_CODES.DUPLICATE_ID);
  });

  it("flags a coverage block that under-reports the real gaps", () => {
    const kit = buildKit({
      requirements: [buildRequirement("r1"), buildRequirement("r2")],
      questions: [buildQuestion("q1", ["r1"])],
    });
    kit.coverage.uncovered_requirement_ids = [];

    expect(codesFor(kit)).toContain(KIT_ISSUE_CODES.COVERAGE_MISMATCH);
  });

  it("flags a must-have requirement whose question never reaches the schedule", () => {
    const kit = buildKit();
    for (const day of kit.schedule.days) {
      day.question_ids = day.question_ids.filter((id) => id !== "q1");
    }

    expect(codesFor(kit)).toContain(
      KIT_ISSUE_CODES.UNSCHEDULED_MUST_REQUIREMENT,
    );
  });

  it("treats a must-have with no question at all as a warning, not a rejection", () => {
    const kit = buildKit({
      requirements: [buildRequirement("r1"), buildRequirement("r2")],
      questions: [buildQuestion("q1", ["r1"])],
    });

    const result = validateKit(kit);
    const unscheduled = result.issues.filter(
      (issue) => issue.code === KIT_ISSUE_CODES.UNSCHEDULED_MUST_REQUIREMENT,
    );

    expect(result.ok).toBe(true);
    expect(unscheduled).toHaveLength(1);
    expect(unscheduled[0]?.severity).toBe("warning");
  });

  it("does not require a nice-to-have requirement to be scheduled", () => {
    const kit = buildKit({
      requirements: [
        buildRequirement("r1"),
        buildRequirement("r2", { priority: "nice" }),
      ],
      questions: [buildQuestion("q1", ["r1"])],
    });
    kit.coverage.uncovered_requirement_ids = ["r2"];

    expect(validateKit(kit).ok).toBe(true);
  });
});
