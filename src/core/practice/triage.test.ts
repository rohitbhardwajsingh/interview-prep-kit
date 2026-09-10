import { describe, expect, it } from "vitest";
import { buildQuestion, buildRequirement } from "../testing/builders";
import { mockSet, triage, type QuestionState } from "./triage";

const REQUIREMENTS = [
  buildRequirement("must-1"),
  buildRequirement("nice-1", { priority: "nice" }),
];

function state(
  questionId: string,
  overrides: Partial<QuestionState> = {},
): QuestionState {
  return {
    questionId,
    box: 0,
    timesSeen: 0,
    bestScore: null,
    predictionGap: null,
    ...overrides,
  };
}

/** Untouched, so ordering comes only from priority and difficulty. */
const FRESH = [
  buildQuestion("q-must", ["must-1"]),
  buildQuestion("q-nice", ["nice-1"]),
];

describe("triage", () => {
  it("puts a blind spot above everything else", () => {
    const result = triage({
      questions: [
        buildQuestion("blind", ["nice-1"]),
        buildQuestion("fresh", ["must-1"]),
      ],
      requirements: REQUIREMENTS,
      states: [
        state("blind", { timesSeen: 2, box: 2, bestScore: 45, predictionGap: 45 }),
      ],
      minutes: 60,
    });

    expect(result.actions[0]?.questionId).toBe("blind");
    expect(result.actions[0]?.reason).toContain("rated this well above");
  });

  it("prefers an untouched must-have to an untouched nice-to-have", () => {
    const result = triage({
      questions: FRESH,
      requirements: REQUIREMENTS,
      states: [],
      minutes: 60,
    });

    expect(result.actions.map((action) => action.questionId)).toEqual([
      "q-must",
      "q-nice",
    ]);
    expect(result.actions[0]?.reason).toContain("must-have");
  });

  it("says so when a must-have has no story behind it", () => {
    const result = triage({
      questions: [buildQuestion("q-must", ["must-1"])],
      requirements: REQUIREMENTS,
      states: [],
      unevidencedRequirementIds: ["must-1"],
      minutes: 60,
    });

    expect(result.actions[0]?.reason).toContain("no story");
  });

  it("treats a question answered well as upkeep, not work", () => {
    const result = triage({
      questions: [buildQuestion("known", ["must-1"])],
      requirements: REQUIREMENTS,
      states: [state("known", { box: 4, timesSeen: 5, bestScore: 88 })],
      minutes: 60,
    });

    expect(result.actions[0]?.kind).toBe("review");
    expect(result.actions[0]?.reason).toContain("upkeep");
  });

  it("brings back a question that fell over out loud", () => {
    const result = triage({
      questions: [
        buildQuestion("weak", ["nice-1"]),
        buildQuestion("fresh", ["must-1"]),
      ],
      requirements: REQUIREMENTS,
      states: [state("weak", { box: 2, timesSeen: 3, bestScore: 22 })],
      minutes: 60,
    });

    expect(result.actions[0]?.questionId).toBe("weak");
    expect(result.actions[0]?.reason).toContain("fell over");
  });

  it("notices a question reviewed but never actually said", () => {
    const result = triage({
      questions: [buildQuestion("silent", ["must-1"])],
      requirements: REQUIREMENTS,
      states: [state("silent", { box: 3, timesSeen: 2, bestScore: null })],
      minutes: 60,
    });

    expect(result.actions[0]?.kind).toBe("answer");
    expect(result.actions[0]?.reason).toContain("never said out loud");
  });

  describe("under a budget", () => {
    it("fits only what there is time for", () => {
      const result = triage({
        questions: [
          buildQuestion("a", ["must-1"]),
          buildQuestion("b", ["must-1"]),
          buildQuestion("c", ["must-1"]),
        ],
        requirements: REQUIREMENTS,
        states: [],
        minutes: 10,
      });

      // Answering costs four minutes, so ten minutes buys two.
      expect(result.actions).toHaveLength(2);
      expect(result.minutesUsed).toBe(8);
      expect(result.deferred).toBe(1);
    });

    it("does not swap the most urgent item for two cheaper ones", () => {
      const result = triage({
        questions: [
          buildQuestion("blind", ["must-1"]),
          buildQuestion("upkeep-a", ["nice-1"]),
          buildQuestion("upkeep-b", ["nice-1"]),
        ],
        requirements: REQUIREMENTS,
        states: [
          state("blind", { timesSeen: 1, box: 1, bestScore: 40, predictionGap: 50 }),
          state("upkeep-a", { box: 4, timesSeen: 4, bestScore: 90 }),
          state("upkeep-b", { box: 4, timesSeen: 4, bestScore: 90 }),
        ],
        minutes: 4,
      });

      expect(result.actions.map((action) => action.questionId)).toEqual(["blind"]);
    });

    it("is honest when there is not enough time for anything", () => {
      const result = triage({
        questions: [buildQuestion("a", ["must-1"])],
        requirements: REQUIREMENTS,
        states: [],
        minutes: 1,
      });

      expect(result.actions).toEqual([]);
      expect(result.summary).toContain("not quite enough");
    });

    it("says what the time will actually buy", () => {
      const result = triage({
        questions: [buildQuestion("a", ["must-1"])],
        requirements: REQUIREMENTS,
        states: [],
        minutes: 10,
      });

      expect(result.summary).toContain("answer 1 out loud");
    });

    it("has something to say about an empty kit", () => {
      const result = triage({
        questions: [],
        requirements: REQUIREMENTS,
        states: [],
        minutes: 10,
      });

      expect(result.summary).toContain("no questions");
    });
  });
});

describe("mockSet", () => {
  it("spreads across categories rather than drilling the weakest", () => {
    const questions = [
      buildQuestion("t1", ["must-1"], { category: "technical" }),
      buildQuestion("t2", ["must-1"], { category: "technical" }),
      buildQuestion("t3", ["must-1"], { category: "technical" }),
      buildQuestion("b1", ["must-1"], { category: "behavioural" }),
      buildQuestion("s1", ["must-1"], { category: "system-design" }),
    ];

    const set = mockSet({
      questions,
      requirements: REQUIREMENTS,
      states: [],
      count: 3,
    });

    expect(new Set(set.map((question) => question.category)).size).toBe(3);
  });

  it("opens with the easiest question", () => {
    const questions = [
      buildQuestion("hard", ["must-1"], { difficulty: 3 }),
      buildQuestion("easy", ["must-1"], { difficulty: 1 }),
      buildQuestion("mid", ["must-1"], { difficulty: 2 }),
    ];

    const set = mockSet({
      questions,
      requirements: REQUIREMENTS,
      states: [],
      count: 3,
    });

    expect(set.map((question) => question.difficulty)).toEqual([1, 2, 3]);
  });

  it("returns what exists when the kit is smaller than the interview", () => {
    const set = mockSet({
      questions: [buildQuestion("only", ["must-1"])],
      requirements: REQUIREMENTS,
      states: [],
      count: 5,
    });

    expect(set).toHaveLength(1);
  });

  it("never repeats a question", () => {
    const questions = Array.from({ length: 6 }, (_unused, index) =>
      buildQuestion(`q${index}`, ["must-1"], {
        category: index % 2 === 0 ? "technical" : "behavioural",
      }),
    );

    const set = mockSet({
      questions,
      requirements: REQUIREMENTS,
      states: [],
      count: 6,
    });

    expect(new Set(set.map((question) => question.id)).size).toBe(6);
  });

  it("copes with an empty kit", () => {
    expect(
      mockSet({ questions: [], requirements: [], states: [], count: 5 }),
    ).toEqual([]);
  });
});
