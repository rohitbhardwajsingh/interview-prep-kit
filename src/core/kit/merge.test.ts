import { describe, expect, it } from "vitest";
import { buildQuestion } from "../testing/builders";
import { mergeRegenerated } from "./merge";
import {
  isProtected,
  markEdited,
  markPinned,
  markUnpinned,
  type Tracked,
} from "./provenance";
import type { TrackedQuestion } from "./tracked";

function tracked(
  id: string,
  provenance: Tracked["provenance"],
  overrides: Partial<TrackedQuestion> = {},
): TrackedQuestion {
  return { ...buildQuestion(id, ["r1"]), provenance, ...overrides };
}

const draft = (prompt: string) => ({
  requirement_ids: ["r1"],
  category: "technical" as const,
  prompt,
  answer_outline: "outline",
  difficulty: 2,
});

describe("provenance transitions", () => {
  it("treats an edit as the strongest claim", () => {
    expect(markEdited(tracked("q1", "generated")).provenance).toBe("edited");
    expect(markEdited(tracked("q1", "pinned")).provenance).toBe("edited");
  });

  it("does not let pinning downgrade an edit", () => {
    // Pinning an edited item must not quietly relabel the user's own text as
    // merely kept, which would lose the fact that they rewrote it.
    expect(markPinned(tracked("q1", "edited")).provenance).toBe("edited");
  });

  it("pins untouched model output", () => {
    expect(markPinned(tracked("q1", "generated")).provenance).toBe("pinned");
  });

  it("releases a pin back to replaceable", () => {
    expect(markUnpinned(tracked("q1", "pinned")).provenance).toBe("generated");
  });

  it("refuses to release an edit, because the text is still the user's", () => {
    expect(markUnpinned(tracked("q1", "edited")).provenance).toBe("edited");
  });

  it("protects everything except untouched model output", () => {
    expect(isProtected(tracked("q1", "generated"))).toBe(false);
    expect(isProtected(tracked("q1", "edited"))).toBe(true);
    expect(isProtected(tracked("q1", "pinned"))).toBe(true);
  });
});

describe("mergeRegenerated", () => {
  it("replaces untouched model output", () => {
    const { items, report } = mergeRegenerated({
      existing: [tracked("q1", "generated")],
      incoming: [draft("A fresh question.")],
      idPrefix: "q",
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.prompt).toBe("A fresh question.");
    expect(report).toMatchObject({ replaced: 1, added: 1, kept: 0 });
  });

  it("keeps an edited question through a regeneration", () => {
    const mine = tracked("q1", "edited", { prompt: "My own wording." });

    const { items } = mergeRegenerated({
      existing: [mine, tracked("q2", "generated")],
      incoming: [draft("Replacement.")],
      idPrefix: "q",
    });

    expect(items.map((item) => item.prompt)).toEqual([
      "My own wording.",
      "Replacement.",
    ]);
  });

  it("keeps a pinned question through a regeneration", () => {
    const { items, report } = mergeRegenerated({
      existing: [tracked("q1", "pinned"), tracked("q2", "generated")],
      incoming: [],
      idPrefix: "q",
    });

    expect(items.map((item) => item.id)).toEqual(["q1"]);
    expect(report).toMatchObject({ kept: 1, replaced: 1 });
  });

  it("leaves another category completely alone", () => {
    const existing = [
      tracked("q1", "generated", { category: "technical" }),
      tracked("q2", "generated", { category: "behavioural" }),
    ];

    const { items, report } = mergeRegenerated({
      existing,
      incoming: [draft("New technical question.")],
      inScope: (item) => item.category === "technical",
      idPrefix: "q",
    });

    // q2 is still untouched model output, but it was never a candidate.
    expect(items.map((item) => item.id)).toEqual(["q2", "q3"]);
    expect(report).toMatchObject({ untouched: 1, replaced: 1, added: 1 });
  });

  it("gives new items ids that continue the whole sequence", () => {
    const { items } = mergeRegenerated({
      existing: [
        tracked("q1", "edited"),
        tracked("q7", "pinned"),
        tracked("q9", "generated"),
      ],
      incoming: [draft("One."), draft("Two.")],
      idPrefix: "q",
    });

    // q9 was replaced, but its id is not recycled: the sequence continues past
    // it, because an id must never come to mean different content.
    expect(items.map((item) => item.id)).toEqual(["q1", "q7", "q10", "q11"]);
  });

  it("never reuses an id held by an out-of-scope item", () => {
    const { items } = mergeRegenerated({
      existing: [
        tracked("q1", "generated", { category: "technical" }),
        tracked("q2", "generated", { category: "behavioural" }),
      ],
      incoming: [draft("New.")],
      inScope: (item) => item.category === "technical",
      idPrefix: "q",
    });

    const ids = items.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain("q2extra");
    expect(ids).toEqual(["q2", "q3"]);
  });

  it("marks everything it adds as replaceable", () => {
    const { items } = mergeRegenerated({
      existing: [] as TrackedQuestion[],
      incoming: [draft("Fresh.")],
      idPrefix: "q",
    });

    expect(items[0]?.provenance).toBe("generated");
  });

  it("survives a regeneration that returns nothing", () => {
    const { items, report } = mergeRegenerated({
      existing: [tracked("q1", "edited")],
      incoming: [],
      idPrefix: "q",
    });

    expect(items.map((item) => item.id)).toEqual(["q1"]);
    expect(report.added).toBe(0);
  });

  it("keeps the user's work even when every incoming item is dropped", () => {
    const { items } = mergeRegenerated({
      existing: [tracked("q1", "edited"), tracked("q2", "pinned")],
      incoming: [],
      idPrefix: "q",
    });

    expect(items).toHaveLength(2);
    expect(items.every(isProtected)).toBe(true);
  });

  it("reports a repeated regeneration as idempotent in kept work", () => {
    const first = mergeRegenerated({
      existing: [tracked("q1", "edited"), tracked("q2", "generated")],
      incoming: [draft("Pass one.")],
      idPrefix: "q",
    });

    const second = mergeRegenerated({
      existing: first.items,
      incoming: [draft("Pass two.")],
      idPrefix: "q",
    });

    // The edit survives both passes; only the generated item churns.
    expect(second.items.map((item) => item.provenance)).toEqual([
      "edited",
      "generated",
    ]);
    expect(second.items[0]?.id).toBe("q1");
  });
});
