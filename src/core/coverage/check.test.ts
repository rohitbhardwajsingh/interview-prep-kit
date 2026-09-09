import { describe, expect, it } from "vitest";
import { checkCoverage } from "./check";
import { buildQuestion, buildRequirement } from "../testing/builders";

describe("checkCoverage", () => {
  it("splits uncovered requirements by priority", () => {
    const requirements = [
      buildRequirement("r1", { priority: "must" }),
      buildRequirement("r2", { priority: "must" }),
      buildRequirement("r3", { priority: "nice" }),
    ];
    const questions = [buildQuestion("q1", ["r1"])];

    const report = checkCoverage(requirements, questions);

    expect(report.covered_requirement_ids).toEqual(["r1"]);
    expect(report.uncovered_requirement_ids).toEqual(["r2", "r3"]);
    expect(report.uncovered_must_requirement_ids).toEqual(["r2"]);
    expect(report.uncovered_nice_requirement_ids).toEqual(["r3"]);
  });

  it("credits a single question against every requirement it names", () => {
    const requirements = [buildRequirement("r1"), buildRequirement("r2")];
    const questions = [buildQuestion("q1", ["r1", "r2"])];

    const report = checkCoverage(requirements, questions);

    expect(report.uncovered_requirement_ids).toEqual([]);
    expect(report.questions_by_requirement).toEqual({ r1: ["q1"], r2: ["q1"] });
  });

  it("refuses to credit references to requirements that do not exist", () => {
    const requirements = [buildRequirement("r1")];
    const questions = [buildQuestion("q1", ["r9"])];

    const report = checkCoverage(requirements, questions);

    expect(report.uncovered_requirement_ids).toEqual(["r1"]);
    expect(report.orphan_question_ids).toEqual(["q1"]);
  });

  it("treats a question with no requirement ids as an orphan", () => {
    const report = checkCoverage([buildRequirement("r1")], [buildQuestion("q1", [])]);

    expect(report.orphan_question_ids).toEqual(["q1"]);
    expect(report.uncovered_must_requirement_ids).toEqual(["r1"]);
  });

  it("does not list the same question twice for one requirement", () => {
    const requirements = [buildRequirement("r1")];
    const questions = [buildQuestion("q1", ["r1", "r1"])];

    expect(checkCoverage(requirements, questions).questions_by_requirement).toEqual({
      r1: ["q1"],
    });
  });

  it("reports nothing uncovered when there are no requirements", () => {
    const report = checkCoverage([], []);

    expect(report.uncovered_requirement_ids).toEqual([]);
    expect(report.covered_requirement_ids).toEqual([]);
  });
});
