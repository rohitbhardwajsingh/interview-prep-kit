import { describe, expect, it } from "vitest";
import { buildQuestion, buildRequirement } from "../testing/builders";
import { OVERUSE_THRESHOLD, checkEvidence } from "./check";

const requirements = [
  buildRequirement("r1"),
  buildRequirement("r2"),
  buildRequirement("r3", { priority: "nice" }),
];

const questions = [
  buildQuestion("q1", ["r1"]),
  buildQuestion("q2", ["r2"]),
  buildQuestion("q3", ["r3"]),
];

describe("checkEvidence", () => {
  it("flags a must-have with questions but no story as critical", () => {
    const report = checkEvidence(requirements, questions, [
      { storyId: "s1", requirementIds: ["r1"] },
    ]);

    expect(report.critical_requirement_ids).toEqual(["r2"]);
  });

  it("does not call a nice-to-have gap critical", () => {
    const report = checkEvidence(requirements, questions, [
      { storyId: "s1", requirementIds: ["r1", "r2"] },
    ]);

    expect(report.unevidenced_requirement_ids).toEqual(["r3"]);
    expect(report.critical_requirement_ids).toEqual([]);
  });

  it("does not call a must-have critical when nothing will ask about it", () => {
    // No question cites r2, so having no story for it costs the user nothing.
    const report = checkEvidence(
      requirements,
      [buildQuestion("q1", ["r1"])],
      [{ storyId: "s1", requirementIds: ["r1"] }],
    );

    expect(report.unevidenced_requirement_ids).toContain("r2");
    expect(report.critical_requirement_ids).toEqual([]);
  });

  it("refuses to credit a story for a requirement that does not exist", () => {
    const report = checkEvidence(requirements, questions, [
      { storyId: "s1", requirementIds: ["r99"] },
    ]);

    expect(report.unevidenced_requirement_ids).toEqual(["r1", "r2", "r3"]);
    expect(report.unused_story_ids).toEqual(["s1"]);
  });

  it("reports a story that backs nothing in this kit", () => {
    const report = checkEvidence(requirements, questions, [
      { storyId: "s1", requirementIds: ["r1"] },
      { storyId: "s2", requirementIds: [] },
    ]);

    expect(report.unused_story_ids).toEqual(["s2"]);
  });

  it("reports a story stretched across too many requirements", () => {
    const many = Array.from({ length: OVERUSE_THRESHOLD }, (_, index) =>
      buildRequirement(`x${index}`),
    );

    const report = checkEvidence(
      many,
      many.map((r, i) => buildQuestion(`q${i}`, [r.id])),
      [{ storyId: "s1", requirementIds: many.map((r) => r.id) }],
    );

    expect(report.overused_story_ids).toEqual(["s1"]);
  });

  it("does not call a reasonably reused story overused", () => {
    const report = checkEvidence(requirements, questions, [
      { storyId: "s1", requirementIds: ["r1", "r2"] },
    ]);

    expect(report.overused_story_ids).toEqual([]);
  });

  it("collapses a requirement claimed twice by one story", () => {
    const report = checkEvidence(requirements, questions, [
      { storyId: "s1", requirementIds: ["r1", "r1"] },
    ]);

    const r1 = report.byRequirement.find((e) => e.requirementId === "r1");
    expect(r1?.storyIds).toEqual(["s1"]);
  });

  it("lists which questions each requirement will be tested by", () => {
    const report = checkEvidence(
      requirements,
      [buildQuestion("q1", ["r1"]), buildQuestion("q2", ["r1"])],
      [],
    );

    const r1 = report.byRequirement.find((e) => e.requirementId === "r1");
    expect(r1?.questionIds).toEqual(["q1", "q2"]);
  });

  it("says everything is a gap when the user has recorded nothing", () => {
    const report = checkEvidence(requirements, questions, []);

    expect(report.unevidenced_requirement_ids).toEqual(["r1", "r2", "r3"]);
    expect(report.critical_requirement_ids).toEqual(["r1", "r2"]);
    expect(report.unused_story_ids).toEqual([]);
  });

  it("reports nothing to fix for a fully evidenced kit", () => {
    const report = checkEvidence(requirements, questions, [
      { storyId: "s1", requirementIds: ["r1"] },
      { storyId: "s2", requirementIds: ["r2"] },
      { storyId: "s3", requirementIds: ["r3"] },
    ]);

    expect(report.unevidenced_requirement_ids).toEqual([]);
    expect(report.critical_requirement_ids).toEqual([]);
    expect(report.unused_story_ids).toEqual([]);
    expect(report.overused_story_ids).toEqual([]);
  });
});
