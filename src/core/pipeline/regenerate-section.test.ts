import { describe, expect, it } from "vitest";
import { markEdited, markPinned } from "../kit/provenance";
import type { TrackedKit } from "../kit/tracked";
import { trackKit } from "../kit/tracked";
import {
  buildFlashcard,
  buildKit,
  buildQuestion,
  buildRequirement,
} from "../testing/builders";
import { createFakePorts } from "../testing/fake-ports";
import { regenerateSection } from "./regenerate-section";

const REQUIREMENTS = [
  buildRequirement("r1"),
  buildRequirement("r2"),
  buildRequirement("r3", { priority: "nice" }),
];

const REQUEST = {
  jd: "Senior Backend Engineer at Acme",
  companyUrl: "http://localhost:8099/acme/",
  days: 3,
};

function storedKit(): TrackedKit {
  return trackKit(
    buildKit({
      requirements: REQUIREMENTS,
      questions: [
        buildQuestion("q1", ["r1"]),
        buildQuestion("q2", ["r2"]),
        buildQuestion("q3", ["r3"]),
      ],
      flashcards: [buildFlashcard("f1", ["r1"]), buildFlashcard("f2", ["r2"])],
    }),
  );
}

/** Marks one item of a section, mirroring what the edit and pin routes store. */
function withProvenance(
  kit: TrackedKit,
  changes: { questions?: Record<string, "edited" | "pinned"> },
): TrackedKit {
  return {
    ...kit,
    questions: kit.questions.map((question) => {
      const state = changes.questions?.[question.id];
      if (!state) return question;
      return state === "edited" ? markEdited(question) : markPinned(question);
    }),
  };
}

describe("regenerateSection", () => {
  describe("questions", () => {
    it("replaces the model's own questions", async () => {
      const ports = createFakePorts({
        requirements: REQUIREMENTS,
        questionsByPass: [
          [buildQuestion("ignored-1", ["r1"]), buildQuestion("ignored-2", ["r2"])],
        ],
      });

      const result = await regenerateSection(
        { kit: storedKit(), request: REQUEST, section: "questions" },
        ports,
      );

      expect(result.merge).toMatchObject({ replaced: 3, added: 2, kept: 0 });
      expect(result.kit.questions).toHaveLength(2);
    });

    it("keeps the questions the user edited or pinned", async () => {
      const kit = withProvenance(storedKit(), {
        questions: { q1: "edited", q2: "pinned" },
      });
      const ports = createFakePorts({
        requirements: REQUIREMENTS,
        questionsByPass: [[buildQuestion("fresh", ["r3"])]],
      });

      const result = await regenerateSection(
        { kit, request: REQUEST, section: "questions" },
        ports,
      );

      expect(result.merge).toMatchObject({ kept: 2, replaced: 1, added: 1 });

      const kept = result.kit.questions.filter(
        (question) => question.provenance !== "generated",
      );
      expect(kept.map((question) => question.id)).toEqual(["q1", "q2"]);
      expect(kept.map((question) => question.provenance)).toEqual([
        "edited",
        "pinned",
      ]);
    });

    it("never reuses the id of a question it just replaced", async () => {
      const ports = createFakePorts({
        requirements: REQUIREMENTS,
        questionsByPass: [
          [buildQuestion("a", ["r1"]), buildQuestion("b", ["r2"])],
        ],
      });

      const result = await regenerateSection(
        { kit: storedKit(), request: REQUEST, section: "questions" },
        ports,
      );

      // q1..q3 were discarded, so a pin or a practice record still pointing at
      // one of them must not silently reattach to different content.
      const ids = result.kit.questions.map((question) => question.id);
      expect(ids).toEqual(["q4", "q5"]);
    });

    it("tells the model which questions survive, so it does not repeat them", async () => {
      const kit = withProvenance(storedKit(), {
        questions: { q1: "edited" },
      });
      const ports = createFakePorts({
        requirements: REQUIREMENTS,
        questionsByPass: [[buildQuestion("fresh", ["r2"])]],
      });

      await regenerateSection(
        { kit, request: REQUEST, section: "questions" },
        ports,
      );

      const [call] = ports.calls.generateQuestions;
      expect(call?.existingQuestions.map((question) => question.id)).toEqual([
        "q1",
      ]);
      // The prompt receives the documented shape, not the stored one.
      expect(call?.existingQuestions[0]).not.toHaveProperty("provenance");
    });

    it("does not read the company's site again", async () => {
      // Research throws if it is called at all: the pages were read once and
      // the brief is already on the kit.
      const ports = createFakePorts({
        requirements: REQUIREMENTS,
        questionsByPass: [[buildQuestion("fresh", ["r1"])]],
        failOn: "research",
      });

      const result = await regenerateSection(
        { kit: storedKit(), request: REQUEST, section: "questions" },
        ports,
      );

      expect(result.kit.questions).toHaveLength(1);
    });

    it("passes the stored brief to the model instead of an empty one", async () => {
      const ports = createFakePorts({
        requirements: REQUIREMENTS,
        questionsByPass: [[buildQuestion("fresh", ["r1"])]],
      });

      await regenerateSection(
        { kit: storedKit(), request: REQUEST, section: "questions" },
        ports,
      );

      const [call] = ports.calls.generateQuestions;
      expect(call?.findings.company).toBe("Acme");
      expect(call?.findings.brief.summary).toContain("logistics");
    });

    it("recomputes coverage against the questions that remain", async () => {
      const ports = createFakePorts({
        requirements: REQUIREMENTS,
        questionsByPass: [[buildQuestion("only", ["r1"])]],
      });

      const result = await regenerateSection(
        { kit: storedKit(), request: REQUEST, section: "questions" },
        ports,
      );

      // r2 and r3 lost their questions, and the kit says so rather than
      // keeping the coverage it had before.
      expect(result.kit.coverage.uncovered_requirement_ids).toEqual([
        "r2",
        "r3",
      ]);
    });

    it("reallocates the schedule around the new questions", async () => {
      const ports = createFakePorts({
        requirements: REQUIREMENTS,
        questionsByPass: [[buildQuestion("only", ["r1"])]],
      });

      const result = await regenerateSection(
        { kit: storedKit(), request: REQUEST, section: "questions" },
        ports,
      );

      const scheduled = result.kit.schedule.days.flatMap((day) => day.question_ids);
      const present = new Set(result.kit.questions.map((question) => question.id));

      expect(scheduled.length).toBeGreaterThan(0);
      for (const id of scheduled) expect(present.has(id)).toBe(true);
      expect(result.kit.schedule.days_available).toBe(3);
    });

    it("leaves every other section exactly as it was", async () => {
      const before = storedKit();
      const ports = createFakePorts({
        requirements: REQUIREMENTS,
        questionsByPass: [[buildQuestion("fresh", ["r1"])]],
      });

      const result = await regenerateSection(
        { kit: before, request: REQUEST, section: "questions" },
        ports,
      );

      expect(result.kit.flashcards).toEqual(before.flashcards);
      expect(result.kit.role).toEqual(before.role);
      expect(result.kit.company_brief).toEqual(before.company_brief);
      expect(result.kit.source).toEqual(before.source);
    });

    it("drops a citation to a requirement the kit no longer has", async () => {
      const ports = createFakePorts({
        requirements: REQUIREMENTS,
        questionsByPass: [[buildQuestion("fresh", ["r1", "r-gone"])]],
      });

      const result = await regenerateSection(
        { kit: storedKit(), request: REQUEST, section: "questions" },
        ports,
      );

      expect(result.kit.questions[0]?.requirement_ids).toEqual(["r1"]);
      expect(result.reconciled.danglingReferencesRemoved).toBe(1);
    });
  });

  describe("flashcards", () => {
    it("replaces the cards without touching the questions", async () => {
      const before = storedKit();
      const ports = createFakePorts({
        requirements: REQUIREMENTS,
        flashcards: [buildFlashcard("new", ["r1"])],
      });

      const result = await regenerateSection(
        { kit: before, request: REQUEST, section: "flashcards" },
        ports,
      );

      expect(result.merge).toMatchObject({ replaced: 2, added: 1, kept: 0 });
      expect(result.kit.flashcards.map((card) => card.id)).toEqual(["f3"]);
      expect(result.kit.questions).toEqual(before.questions);
    });

    it("generates against the questions the kit currently has", async () => {
      const ports = createFakePorts({
        requirements: REQUIREMENTS,
        flashcards: [buildFlashcard("new", ["r1"])],
      });

      const result = await regenerateSection(
        { kit: storedKit(), request: REQUEST, section: "flashcards" },
        ports,
      );

      expect(result.kit.coverage.uncovered_requirement_ids).toEqual([]);
    });
  });

  it("records what it did in the trace", async () => {
    const ports = createFakePorts({
      requirements: REQUIREMENTS,
      questionsByPass: [[buildQuestion("fresh", ["r1"])]],
    });

    const result = await regenerateSection(
      { kit: storedKit(), request: REQUEST, section: "questions" },
      ports,
    );

    expect(result.trace.map((entry) => entry.step)).toEqual([
      "regenerate-questions",
    ]);
  });
});
