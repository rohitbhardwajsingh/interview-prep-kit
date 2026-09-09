import { describe, expect, it } from "vitest";
import { buildKit, buildQuestion, buildRequirement } from "../testing/builders";
import { reconcileKit } from "./reconcile";
import { trackKit, untrackKit, type TrackedKit } from "./tracked";
import { validateKit } from "./validate";
import { markEdited } from "./provenance";

function kitWith(options: Parameters<typeof buildKit>[0] = {}): TrackedKit {
  return trackKit(buildKit(options));
}

describe("trackKit", () => {
  it("marks a fresh kit as entirely the model's", () => {
    const tracked = kitWith();

    expect(tracked.questions.every((q) => q.provenance === "generated")).toBe(true);
    expect(tracked.flashcards.every((f) => f.provenance === "generated")).toBe(true);
    expect(
      tracked.role.requirements.every((r) => r.provenance === "generated"),
    ).toBe(true);
  });

  it("round-trips back to the documented shape", () => {
    const kit = buildKit();

    expect(untrackKit(trackKit(kit))).toEqual(kit);
  });

  it("produces a kit the validator still accepts once untracked", () => {
    expect(validateKit(untrackKit(kitWith())).ok).toBe(true);
  });
});

describe("reconcileKit", () => {
  it("drops a citation whose requirement was deleted", () => {
    const base = kitWith({
      requirements: [buildRequirement("r1"), buildRequirement("r2")],
      questions: [buildQuestion("q1", ["r1", "r2"])],
    });

    const withoutR2: TrackedKit = {
      ...base,
      role: {
        ...base.role,
        requirements: base.role.requirements.filter((r) => r.id !== "r2"),
      },
    };

    const { kit, report } = reconcileKit(withoutR2);

    expect(kit.questions[0]?.requirement_ids).toEqual(["r1"]);
    expect(report.danglingReferencesRemoved).toBe(1);
    expect(validateKit(untrackKit(kit)).ok).toBe(true);
  });

  it("keeps a question the user wrote even after its requirement is gone", () => {
    const base = kitWith({
      requirements: [buildRequirement("r1")],
      questions: [buildQuestion("q1", ["r1"])],
    });

    const orphaned: TrackedKit = {
      ...base,
      role: { ...base.role, requirements: [] },
      questions: [markEdited(base.questions[0]!)],
    };

    const { kit, report } = reconcileKit(orphaned);

    expect(kit.questions).toHaveLength(1);
    expect(kit.questions[0]?.requirement_ids).toEqual([]);
    expect(report.orphanQuestionIds).toEqual(["q1"]);
  });

  it("recomputes coverage rather than trusting what was recorded", () => {
    const base = kitWith({
      requirements: [buildRequirement("r1"), buildRequirement("r2")],
      questions: [buildQuestion("q1", ["r1"])],
    });

    const lying: TrackedKit = {
      ...base,
      coverage: { ...base.coverage, uncovered_requirement_ids: [] },
    };

    const { kit } = reconcileKit(lying);

    expect(kit.coverage.uncovered_requirement_ids).toEqual(["r2"]);
    expect(validateKit(untrackKit(kit)).ok).toBe(true);
  });

  it("reallocates the schedule after a question is removed", () => {
    const base = kitWith({
      requirements: [buildRequirement("r1"), buildRequirement("r2")],
      questions: [buildQuestion("q1", ["r1"]), buildQuestion("q2", ["r2"])],
      daysAvailable: 3,
    });

    const trimmed: TrackedKit = {
      ...base,
      questions: base.questions.filter((q) => q.id !== "q2"),
    };

    const { kit } = reconcileKit(trimmed);

    const scheduled = kit.schedule.days.flatMap((day) => day.question_ids);
    expect(scheduled).not.toContain("q2");
    expect(kit.schedule.days).toHaveLength(3);
    expect(validateKit(untrackKit(kit)).ok).toBe(true);
  });

  it("schedules a question the user added", () => {
    const base = kitWith({
      requirements: [buildRequirement("r1")],
      questions: [buildQuestion("q1", ["r1"])],
      daysAvailable: 2,
    });

    const grown: TrackedKit = {
      ...base,
      questions: [
        ...base.questions,
        { ...buildQuestion("q2", ["r1"]), provenance: "edited" },
      ],
    };

    const { kit } = reconcileKit(grown);

    const scheduled = kit.schedule.days.flatMap((day) => day.question_ids);
    expect(scheduled).toContain("q2");
    expect(validateKit(untrackKit(kit)).ok).toBe(true);
  });

  it("keeps the schedule the exact length the user asked for", () => {
    for (const days of [1, 5, 30]) {
      const { kit } = reconcileKit(kitWith({ daysAvailable: days }));

      expect(kit.schedule.days).toHaveLength(days);
      expect(validateKit(untrackKit(kit)).ok).toBe(true);
    }
  });

  it("preserves the pass count, which is history not derived state", () => {
    const { kit } = reconcileKit(kitWith({ passes: 3 }));

    expect(kit.coverage.passes).toBe(3);
  });

  it("leaves provenance untouched", () => {
    const base = kitWith();
    const edited: TrackedKit = {
      ...base,
      questions: [markEdited(base.questions[0]!), ...base.questions.slice(1)],
    };

    const { kit } = reconcileKit(edited);

    expect(kit.questions[0]?.provenance).toBe("edited");
  });

  it("is idempotent", () => {
    const once = reconcileKit(kitWith()).kit;
    const twice = reconcileKit(once).kit;

    expect(twice).toEqual(once);
  });
});
