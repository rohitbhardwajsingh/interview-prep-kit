import { describe, expect, it } from "vitest";
import { scoreStories, scoreStory, type StoryInput } from "./story-strength";

function story(overrides: Partial<StoryInput> = {}): StoryInput {
  return {
    id: "s1",
    title: "Fixed the reporting endpoint",
    situation:
      "Our Postgres reporting endpoint was taking 8 seconds and customers on the Enterprise plan were complaining every week.",
    action:
      "I ran EXPLAIN ANALYZE, found a sequential scan, and I added a composite index. I also rewrote the query to drop a function call.",
    result:
      "Latency went from 8 seconds to 120 ms and database CPU fell by 30 percent across the fleet.",
    ...overrides,
  };
}

describe("scoreStory", () => {
  it("scores a strong story highly", () => {
    const result = scoreStory(story());

    expect(result.score).toBe(100);
    expect(result.checks.every((check) => check.passed)).toBe(true);
    expect(result.fix).toBeNull();
  });

  describe("the we-versus-I detector", () => {
    it("catches a story told entirely as the team", () => {
      const result = scoreStory(
        story({
          action:
            "We looked at the query, we found the problem together and the team added an index. We then rewrote it as a group.",
        }),
      );

      const ownership = result.checks.find((check) => check.id === "ownership");
      expect(ownership?.passed).toBe(false);
      expect(ownership?.detail).toContain("we");
      expect(result.fix).toContain("first person");
    });

    it("accepts a story with genuine collaboration in it", () => {
      // Half first-person is the bar: real work involves other people.
      const result = scoreStory(
        story({
          action:
            "We agreed on the approach, then I ran EXPLAIN ANALYZE and I added the composite index myself.",
        }),
      );

      expect(
        result.checks.find((check) => check.id === "ownership")?.passed,
      ).toBe(true);
    });

    it("reports the ratio, so the interface can show the balance", () => {
      const result = scoreStory(
        story({ action: "I did the work and I owned it end to end here." }),
      );

      expect(result.ownership).toBe(1);
    });

    it("says so when the action names nobody at all", () => {
      const result = scoreStory(
        story({
          action:
            "An index was added to the table and the query was subsequently rewritten to avoid the call.",
        }),
      );

      expect(result.ownership).toBeNull();
      expect(
        result.checks.find((check) => check.id === "ownership")?.detail,
      ).toContain("never names who");
    });

    it("does not mistake a word containing 'we' for the pronoun", () => {
      const result = scoreStory(
        story({
          action:
            "I reviewed the answers, I lowered the timeouts and I rewrote the weekly job myself.",
        }),
      );

      // "reviewed", "lowered" and "weekly" all contain the letters.
      expect(result.ownership).toBe(1);
    });
  });

  describe("measurable results", () => {
    it("rejects a result with no figure in it", () => {
      const result = scoreStory(
        story({
          result:
            "It got a great deal faster and everybody was much happier with how the system behaved afterwards.",
        }),
      );

      expect(
        result.checks.find((check) => check.id === "measurable")?.passed,
      ).toBe(false);
      expect(result.score).toBeLessThan(100);
    });

    it("accepts a plain figure without a unit", () => {
      const result = scoreStory({
        ...story(),
        result: "We went from 40 support tickets a week down to 3 in total.",
      });

      expect(
        result.checks.find((check) => check.id === "measurable")?.passed,
      ).toBe(true);
    });
  });

  describe("specificity", () => {
    it("flags a story that names nothing", () => {
      const result = scoreStory(
        story({
          situation: "there was a system that was quite slow for the users",
          action: "i looked into it and i made a change that helped a lot",
        }),
      );

      expect(
        result.checks.find((check) => check.id === "specific")?.passed,
      ).toBe(false);
    });
  });

  describe("completeness", () => {
    it("calls out the part that is too thin to tell", () => {
      const result = scoreStory(story({ result: "It was better." }));

      const complete = result.checks.find((check) => check.id === "complete");
      expect(complete?.passed).toBe(false);
      expect(complete?.detail).toContain("result");
    });

    it("fixes completeness before anything else", () => {
      // An unfinished story cannot be told at all, so it outranks a "we".
      const result = scoreStory(
        story({
          action: "We did it.",
          result: "Better.",
        }),
      );

      expect(result.fix).toContain("Finish it");
    });
  });

  it("never leaves nought to a hundred", () => {
    const empty = scoreStory({
      id: "s2",
      title: "",
      situation: "",
      action: "",
      result: "",
    });

    expect(empty.score).toBeGreaterThanOrEqual(0);
    expect(empty.score).toBeLessThanOrEqual(100);
  });

  it("is stable across runs", () => {
    expect(scoreStory(story()).score).toBe(scoreStory(story()).score);
  });
});

describe("scoreStories", () => {
  it("scores each story independently", () => {
    const results = scoreStories([
      story({ id: "a" }),
      story({ id: "b", result: "It felt much better afterwards for us." }),
    ]);

    expect(results.map((entry) => entry.storyId)).toEqual(["a", "b"]);
    expect(results[0]?.score).toBeGreaterThan(results[1]?.score ?? 100);
  });
});
