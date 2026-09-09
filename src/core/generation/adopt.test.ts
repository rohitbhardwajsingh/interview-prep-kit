import { describe, expect, it } from "vitest";
import { buildQuestion } from "../testing/builders";
import {
  adoptFlashcards,
  adoptQuestions,
  adoptRequirements,
  describeAdoption,
} from "./adopt";
import type { DraftFlashcard, DraftQuestion } from "./schemas";

function draftQuestion(overrides: Partial<DraftQuestion> = {}): DraftQuestion {
  return {
    requirement_ids: ["r1"],
    category: "technical",
    prompt: "Walk me through a migration you led.",
    answer_outline: "Scope, rollback plan, verification.",
    difficulty: 2,
    ...overrides,
  };
}

function draftFlashcard(overrides: Partial<DraftFlashcard> = {}): DraftFlashcard {
  return {
    requirement_ids: ["r1"],
    front: "What does a read replica cost you?",
    back: "Replication lag.",
    ...overrides,
  };
}

describe("adoptRequirements", () => {
  it("assigns sequential ids the model never saw", () => {
    const { requirements } = adoptRequirements([
      { text: "Go", kind: "technical", priority: "must" },
      { text: "Kubernetes", kind: "technical", priority: "nice" },
    ]);

    expect(requirements.map((item) => item.id)).toEqual(["r1", "r2"]);
    expect(requirements[0]?.text).toBe("Go");
    expect(requirements[1]?.priority).toBe("nice");
  });

  it("drops a requirement repeated in different words", () => {
    const { requirements, report } = adoptRequirements([
      { text: "Strong Go experience", kind: "technical", priority: "must" },
      { text: "strong  GO experience!", kind: "technical", priority: "nice" },
    ]);

    expect(requirements).toHaveLength(1);
    expect(report.droppedAsDuplicate).toBe(1);
  });

  it("keeps ids contiguous after a duplicate is dropped", () => {
    const { requirements } = adoptRequirements([
      { text: "Go", kind: "technical", priority: "must" },
      { text: "go", kind: "technical", priority: "must" },
      { text: "Postgres", kind: "technical", priority: "must" },
    ]);

    expect(requirements.map((item) => item.id)).toEqual(["r1", "r2"]);
  });
});

describe("adoptQuestions", () => {
  const options = {
    knownRequirementIds: ["r1", "r2"],
    existingQuestions: [],
  };

  it("mints ids and keeps valid citations", () => {
    const { questions } = adoptQuestions(
      [draftQuestion(), draftQuestion({ prompt: "Design a rate limiter." })],
      options,
    );

    expect(questions.map((item) => item.id)).toEqual(["q1", "q2"]);
    expect(questions[0]?.requirement_ids).toEqual(["r1"]);
  });

  it("strips an invented requirement id but keeps the question", () => {
    const { questions, report } = adoptQuestions(
      [draftQuestion({ requirement_ids: ["r1", "r99"] })],
      options,
    );

    expect(questions[0]?.requirement_ids).toEqual(["r1"]);
    expect(report.strippedReferences).toBe(1);
    expect(report.droppedForUnknownReference).toBe(0);
  });

  it("drops a question whose every citation was invented", () => {
    const { questions, report } = adoptQuestions(
      [draftQuestion({ requirement_ids: ["r99", "r100"] })],
      options,
    );

    expect(questions).toEqual([]);
    expect(report.droppedForUnknownReference).toBe(1);
    // The question is gone, so its bad references are not also counted.
    expect(report.strippedReferences).toBe(0);
  });

  it("drops a question that cites nothing at all", () => {
    const { questions, report } = adoptQuestions(
      [draftQuestion({ requirement_ids: [] })],
      options,
    );

    expect(questions).toEqual([]);
    expect(report.droppedForUnknownReference).toBe(1);
  });

  it("collapses a citation repeated on one question", () => {
    const { questions } = adoptQuestions(
      [draftQuestion({ requirement_ids: ["r1", "r1", "r2"] })],
      options,
    );

    expect(questions[0]?.requirement_ids).toEqual(["r1", "r2"]);
  });

  it("continues the id sequence of an earlier pass", () => {
    const { questions } = adoptQuestions([draftQuestion()], {
      knownRequirementIds: ["r1"],
      existingQuestions: [buildQuestion("q1", ["r1"]), buildQuestion("q2", ["r1"])],
    });

    expect(questions[0]?.id).toBe("q3");
  });

  it("drops a later pass repeating an earlier question", () => {
    const existing = buildQuestion("q1", ["r1"], {
      prompt: "Walk me through a migration you led.",
    });

    const { questions, report } = adoptQuestions(
      [draftQuestion({ prompt: "Walk me through a migration you led!" })],
      { knownRequirementIds: ["r1"], existingQuestions: [existing] },
    );

    expect(questions).toEqual([]);
    expect(report.droppedAsDuplicate).toBe(1);
  });

  it("returns only the new questions, not the existing ones", () => {
    const { questions } = adoptQuestions(
      [draftQuestion({ prompt: "Something new entirely." })],
      {
        knownRequirementIds: ["r1"],
        existingQuestions: [buildQuestion("q1", ["r1"])],
      },
    );

    expect(questions).toHaveLength(1);
    expect(questions[0]?.id).toBe("q2");
  });
});

describe("adoptFlashcards", () => {
  it("mints ids and keeps valid citations", () => {
    const { flashcards } = adoptFlashcards(
      [draftFlashcard(), draftFlashcard({ front: "What is a WAL?" })],
      { knownRequirementIds: ["r1"] },
    );

    expect(flashcards.map((item) => item.id)).toEqual(["f1", "f2"]);
  });

  it("drops a card whose citation does not exist", () => {
    const { flashcards, report } = adoptFlashcards(
      [draftFlashcard({ requirement_ids: ["nope"] })],
      { knownRequirementIds: ["r1"] },
    );

    expect(flashcards).toEqual([]);
    expect(report.droppedForUnknownReference).toBe(1);
  });

  it("drops a repeated front", () => {
    const { flashcards, report } = adoptFlashcards(
      [draftFlashcard(), draftFlashcard()],
      { knownRequirementIds: ["r1"] },
    );

    expect(flashcards).toHaveLength(1);
    expect(report.droppedAsDuplicate).toBe(1);
  });
});

describe("describeAdoption", () => {
  it("says nothing when nothing was removed", () => {
    expect(
      describeAdoption({
        droppedForUnknownReference: 0,
        strippedReferences: 0,
        droppedAsDuplicate: 0,
      }),
    ).toBe("");
  });

  it("reports each kind of removal", () => {
    const note = describeAdoption({
      droppedForUnknownReference: 2,
      strippedReferences: 3,
      droppedAsDuplicate: 1,
    });

    expect(note).toContain("2 cited no known requirement");
    expect(note).toContain("3 invented references stripped");
    expect(note).toContain("1 duplicates dropped");
  });
});
