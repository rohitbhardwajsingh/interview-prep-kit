import { describe, expect, it } from "vitest";
import {
  companyBriefDraftSchema,
  draftQuestionSchema,
  flashcardBatchSchema,
  questionBatchSchema,
  roleExtractionSchema,
} from "./schemas";

function question(overrides: Record<string, unknown> = {}) {
  return {
    requirement_ids: ["r1"],
    category: "technical",
    prompt: "Design a queue.",
    answer_outline: "Backpressure, ordering.",
    difficulty: 2,
    ...overrides,
  };
}

describe("draftQuestionSchema", () => {
  it("accepts a well-formed question unchanged", () => {
    const parsed = draftQuestionSchema.parse(question());

    expect(parsed.category).toBe("technical");
    expect(parsed.difficulty).toBe(2);
  });

  it("forgives casing and spacing in a category", () => {
    expect(
      draftQuestionSchema.parse(question({ category: "System Design" })).category,
    ).toBe("system-design");
    expect(
      draftQuestionSchema.parse(question({ category: "  BEHAVIOURAL " })).category,
    ).toBe("behavioural");
  });

  it("forgives the American spelling of behavioural", () => {
    expect(
      draftQuestionSchema.parse(question({ category: "behavioral" })).category,
    ).toBe("behavioural");
  });

  it("rejects a category with no sensible reading", () => {
    expect(() =>
      draftQuestionSchema.parse(question({ category: "vibes" })),
    ).toThrow(/Expected one of/);
  });

  it("clamps a difficulty above the scale rather than failing", () => {
    expect(draftQuestionSchema.parse(question({ difficulty: 5 })).difficulty).toBe(3);
    expect(draftQuestionSchema.parse(question({ difficulty: 0 })).difficulty).toBe(1);
  });

  it("rounds a fractional difficulty", () => {
    expect(draftQuestionSchema.parse(question({ difficulty: 2.4 })).difficulty).toBe(2);
  });

  it("reads a difficulty sent as a string", () => {
    expect(draftQuestionSchema.parse(question({ difficulty: "3" })).difficulty).toBe(3);
  });

  it("rejects a difficulty that is not a number at all", () => {
    expect(() =>
      draftQuestionSchema.parse(question({ difficulty: "hard" })),
    ).toThrow();
  });

  it("accepts a bare string where a list of ids was asked for", () => {
    expect(
      draftQuestionSchema.parse(question({ requirement_ids: "r1" })).requirement_ids,
    ).toEqual(["r1"]);
  });

  it("defaults a missing citation list to empty so the caller can drop it", () => {
    const parsed = draftQuestionSchema.parse(
      question({ requirement_ids: undefined }),
    );

    expect(parsed.requirement_ids).toEqual([]);
  });

  it("defaults a missing answer outline rather than failing the batch", () => {
    expect(
      draftQuestionSchema.parse(question({ answer_outline: undefined }))
        .answer_outline,
    ).toBe("");
  });

  it("still requires a prompt, which is the whole question", () => {
    expect(() => draftQuestionSchema.parse(question({ prompt: "  " }))).toThrow();
  });
});

describe("roleExtractionSchema", () => {
  it("fills in every field a thin reply omits", () => {
    const parsed = roleExtractionSchema.parse({});

    expect(parsed).toEqual({
      title: "",
      seniority: "",
      location: "",
      responsibilities: [],
      requirements: [],
    });
  });

  it("forgives synonyms for requirement priority", () => {
    const parsed = roleExtractionSchema.parse({
      requirements: [
        { text: "Go", kind: "technical", priority: "required" },
        { text: "Rust", kind: "technical", priority: "nice to have" },
      ],
    });

    expect(parsed.requirements.map((item) => item.priority)).toEqual([
      "must",
      "nice",
    ]);
  });

  it("does not invent a title when the posting had none", () => {
    expect(roleExtractionSchema.parse({ title: "   " }).title).toBe("");
  });
});

describe("companyBriefDraftSchema", () => {
  it("treats a missing hiring process as unknown rather than empty text", () => {
    expect(companyBriefDraftSchema.parse({}).hiring_process).toBeNull();
  });

  it("keeps a hiring process that was found", () => {
    expect(
      companyBriefDraftSchema.parse({ hiring_process: "Screen, then onsite." })
        .hiring_process,
    ).toBe("Screen, then onsite.");
  });

  it("has no sources field, because citations are not the model's to give", () => {
    const parsed = companyBriefDraftSchema.parse({
      summary: "x",
      sources: ["http://invented.test/"],
    });

    expect(parsed).not.toHaveProperty("sources");
  });
});

describe("batch schemas", () => {
  it("read an absent list as empty", () => {
    expect(questionBatchSchema.parse({}).questions).toEqual([]);
    expect(flashcardBatchSchema.parse({}).flashcards).toEqual([]);
  });

  it("reject a batch that is not an object", () => {
    expect(() => questionBatchSchema.parse([question()])).toThrow();
  });
});
