import { describe, expect, it } from "vitest";
import {
  QUESTION_ID_PREFIX,
  createIdMinter,
  flashcardId,
  questionId,
  requirementId,
} from "./ids";

describe("sequential ids", () => {
  it("numbers from one", () => {
    expect(requirementId(0)).toBe("r1");
    expect(questionId(3)).toBe("q4");
    expect(flashcardId(0)).toBe("f1");
  });
});

describe("createIdMinter", () => {
  it("continues past the highest existing id", () => {
    const mint = createIdMinter(QUESTION_ID_PREFIX, ["q1", "q2", "q7"]);

    expect(mint()).toBe("q8");
    expect(mint()).toBe("q9");
  });

  it("starts at one when nothing exists yet", () => {
    expect(createIdMinter(QUESTION_ID_PREFIX, [])()).toBe("q1");
  });

  it("ignores ids belonging to another prefix", () => {
    const mint = createIdMinter(QUESTION_ID_PREFIX, ["r12", "f30", "q2"]);

    expect(mint()).toBe("q3");
  });
});
