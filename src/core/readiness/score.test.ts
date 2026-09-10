import { describe, expect, it } from "vitest";
import { MAX_BOX, type ReviewState } from "../practice/leitner";
import { buildQuestion, buildRequirement } from "../testing/builders";
import { scoreReadiness } from "./score";

const REQUIREMENTS = [
  buildRequirement("r1", { priority: "must", text: "Production Go" }),
  buildRequirement("r2", { priority: "must", text: "Postgres at scale" }),
  buildRequirement("r3", { priority: "nice" }),
];

const QUESTIONS = [
  buildQuestion("q1", ["r1"]),
  buildQuestion("q2", ["r2"]),
  buildQuestion("q3", ["r3"]),
];

function seen(questionId: string, box: number): ReviewState {
  return {
    questionId,
    box,
    dueOnDay: 1,
    lastConfidence: box === 0 ? 1 : 5,
    timesSeen: 1,
  };
}

function mastered(questionId: string): ReviewState {
  return seen(questionId, MAX_BOX);
}

describe("scoreReadiness", () => {
  it("scores an untouched kit at zero, however good the kit is", () => {
    const result = scoreReadiness({
      requirements: REQUIREMENTS,
      questions: QUESTIONS,
      reviews: [],
    });

    // Coverage is perfect, but a well-built kit is not an achievement of the
    // person holding it, so opening and closing the app earns nothing.
    expect(result.score).toBe(0);
    expect(result.band).toBe("not-started");
  });

  it("scores a fully drilled kit as ready", () => {
    const result = scoreReadiness({
      requirements: REQUIREMENTS,
      questions: QUESTIONS,
      reviews: QUESTIONS.map((question) => mastered(question.id)),
      evidencedRequirementIds: ["r1", "r2"],
    });

    expect(result.score).toBe(100);
    expect(result.band).toBe("ready");
    expect(result.blockers).toEqual([]);
  });

  it("rises as practice deepens, not merely as questions are seen once", () => {
    const once = scoreReadiness({
      requirements: REQUIREMENTS,
      questions: QUESTIONS,
      reviews: QUESTIONS.map((question) => seen(question.id, 1)),
    });
    const deep = scoreReadiness({
      requirements: REQUIREMENTS,
      questions: QUESTIONS,
      reviews: QUESTIONS.map((question) => seen(question.id, 4)),
    });

    expect(deep.score).toBeGreaterThan(once.score);
  });

  it("treats a question in box zero as unlearned rather than practised", () => {
    const wrong = scoreReadiness({
      requirements: REQUIREMENTS,
      questions: QUESTIONS,
      reviews: QUESTIONS.map((question) => seen(question.id, 0)),
    });

    const practice = wrong.components.find((c) => c.id === "practice");
    expect(practice?.score).toBe(0);
    expect(wrong.blockers).toContain("3 questions you keep getting wrong");
  });

  it("counts a question with no review record as never attempted", () => {
    const result = scoreReadiness({
      requirements: REQUIREMENTS,
      questions: QUESTIONS,
      reviews: [mastered("q1")],
    });

    expect(result.blockers).toContain("2 questions never attempted");
  });

  describe("the evidence component", () => {
    it("is left out entirely when the story bank is unused", () => {
      const result = scoreReadiness({
        requirements: REQUIREMENTS,
        questions: QUESTIONS,
        reviews: QUESTIONS.map((question) => mastered(question.id)),
      });

      expect(result.components.map((c) => c.id)).toEqual(["practice"]);
      // Not using it cannot make you look unprepared.
      expect(result.score).toBe(100);
    });

    it("counts against you once you do use it", () => {
      const result = scoreReadiness({
        requirements: REQUIREMENTS,
        questions: QUESTIONS,
        reviews: QUESTIONS.map((question) => mastered(question.id)),
        evidencedRequirementIds: ["r1"],
      });

      expect(result.score).toBeLessThan(100);
      expect(result.blockers).toContain("1 must-have you have no story for");
    });

    it("only asks for stories against must-haves", () => {
      const result = scoreReadiness({
        requirements: REQUIREMENTS,
        questions: QUESTIONS,
        reviews: QUESTIONS.map((question) => mastered(question.id)),
        evidencedRequirementIds: ["r1", "r2"],
      });

      // r3 is nice-to-have and its absence is not held against you.
      expect(result.score).toBe(100);
    });
  });

  describe("weights always sum to one", () => {
    it("with evidence tracked", () => {
      const result = scoreReadiness({
        requirements: REQUIREMENTS,
        questions: QUESTIONS,
        reviews: [],
        evidencedRequirementIds: [],
      });

      const total = result.components.reduce((sum, c) => sum + c.weight, 0);
      expect(total).toBeCloseTo(1, 10);
    });

    it("and when it is redistributed", () => {
      const result = scoreReadiness({
        requirements: REQUIREMENTS,
        questions: QUESTIONS,
        reviews: [],
      });

      const total = result.components.reduce((sum, c) => sum + c.weight, 0);
      expect(total).toBeCloseTo(1, 10);
    });
  });

  describe("the next action", () => {
    it("sends you at questions you have never tried first", () => {
      const result = scoreReadiness({
        requirements: REQUIREMENTS,
        questions: QUESTIONS,
        reviews: [],
      });

      expect(result.nextAction).toContain("never tried");
    });

    it("then at the ones that keep slipping", () => {
      const result = scoreReadiness({
        requirements: REQUIREMENTS,
        questions: QUESTIONS,
        reviews: [mastered("q1"), mastered("q2"), seen("q3", 0)],
      });

      expect(result.nextAction).toContain("keeps slipping");
    });

    it("then at the missing stories, naming the requirement", () => {
      const result = scoreReadiness({
        requirements: REQUIREMENTS,
        questions: QUESTIONS,
        reviews: QUESTIONS.map((question) => mastered(question.id)),
        evidencedRequirementIds: ["r2"],
      });

      expect(result.nextAction).toContain("Production Go");
    });

    it("and tells you to stop when you are done", () => {
      const result = scoreReadiness({
        requirements: REQUIREMENTS,
        questions: QUESTIONS,
        reviews: QUESTIONS.map((question) => mastered(question.id)),
        evidencedRequirementIds: ["r1", "r2"],
      });

      expect(result.nextAction).toContain("You are ready");
    });
  });

  describe("coverage as a ceiling", () => {
    it("caps the score when a must-have is never asked about", () => {
      // Perfect practice on the one question there is, but half the
      // must-haves are untested, so half ready is the honest answer.
      const result = scoreReadiness({
        requirements: REQUIREMENTS,
        questions: [buildQuestion("q1", ["r1"])],
        reviews: [mastered("q1")],
      });

      expect(result.ceiling.score).toBe(0.5);
      expect(result.score).toBe(50);
      expect(result.ceiling.detail).toContain("Capped");
    });

    it("does not cap a fully covered kit", () => {
      const result = scoreReadiness({
        requirements: REQUIREMENTS,
        questions: QUESTIONS,
        reviews: QUESTIONS.map((question) => mastered(question.id)),
      });

      expect(result.ceiling.score).toBe(1);
      expect(result.score).toBe(100);
    });

    it("reports an uncovered must-have as a blocker", () => {
      const result = scoreReadiness({
        requirements: REQUIREMENTS,
        questions: [buildQuestion("q1", ["r1"])],
        reviews: [mastered("q1")],
      });

      expect(result.blockers[0]).toContain("no question for 1 must-have");
    });

    it("does not divide by zero on a kit with no questions", () => {
      const result = scoreReadiness({
        requirements: REQUIREMENTS,
        questions: [],
        reviews: [],
      });

      expect(Number.isFinite(result.score)).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(0);
    });

    it("does not divide by zero on a posting with no must-haves", () => {
      const result = scoreReadiness({
        requirements: [buildRequirement("r9", { priority: "nice" })],
        questions: QUESTIONS,
        reviews: QUESTIONS.map((question) => mastered(question.id)),
        evidencedRequirementIds: [],
      });

      expect(result.score).toBe(100);
    });
  });

  it("never returns a score outside nought to a hundred", () => {
    const inputs = [0, 1, 2, 3, 4, MAX_BOX].map((box) =>
      scoreReadiness({
        requirements: REQUIREMENTS,
        questions: QUESTIONS,
        reviews: QUESTIONS.map((question) => seen(question.id, box)),
        evidencedRequirementIds: ["r1"],
      }),
    );

    for (const result of inputs) {
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    }
  });
});
