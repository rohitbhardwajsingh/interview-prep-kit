import { describe, expect, it } from "vitest";
import type { KitQuestion } from "../kit/schema";
import { analyseAnswer } from "./analyse";

type QuestionCategory = KitQuestion["category"];

const OUTLINE = [
  "- Explains why the query was slow (missing index, sequential scan)",
  "- Describes how it was measured (EXPLAIN ANALYZE, monitoring tools)",
  "- States what was changed and why",
  "- Gives the measured improvement",
].join("\n");

function question(
  overrides: Partial<{ answer_outline: string; category: QuestionCategory }> = {},
): Pick<KitQuestion, "answer_outline" | "category"> {
  return {
    answer_outline: overrides.answer_outline ?? OUTLINE,
    category: overrides.category ?? "technical",
  };
}

const STRONG = `
  We had a reporting endpoint taking 8 seconds. I ran EXPLAIN ANALYZE and saw a
  sequential scan over 40 million rows because the query filtered on a column
  with no index. I added a composite index on tenant_id and created_at, and
  rewrote the query to avoid the function call that was defeating it.
  Latency went from 8 seconds to 120 ms, and we cut database CPU by 30 percent.
`;

describe("analyseAnswer", () => {
  describe("outline coverage", () => {
    it("finds the points a strong answer actually reached", () => {
      const result = analyseAnswer({
        transcript: STRONG,
        question: question(),
        spokenSeconds: 95,
      });

      expect(result.coverage).toBeGreaterThan(0.7);
      expect(result.points).toHaveLength(4);
    });

    it("says which point was missed, in the outline's own words", () => {
      const result = analyseAnswer({
        transcript:
          "The query was slow because there was no index on the column, it was doing a sequential scan over the whole table.",
        question: question(),
      });

      const missed = result.points.filter((point) => !point.covered);
      expect(missed.some((point) => point.text.includes("measured improvement"))).toBe(
        true,
      );
    });

    it("accepts a named example instead of the general term", () => {
      // The outline offers EXPLAIN ANALYZE as an example of measuring.
      const result = analyseAnswer({
        transcript: "I used EXPLAIN ANALYZE to see what was happening.",
        question: question(),
      });

      const point = result.points.find((entry) =>
        entry.text.includes("how it was measured"),
      );
      expect(point?.covered).toBe(true);
    });

    it("does not credit a point for one incidental word", () => {
      const result = analyseAnswer({
        transcript: "It was slow. Query. Slow query. I do not know why.",
        question: question(),
      });

      expect(result.coverage).toBeLessThan(0.5);
    });

    it("shows the words behind each verdict", () => {
      const result = analyseAnswer({
        transcript: STRONG,
        question: question(),
      });

      const covered = result.points.filter((point) => point.covered);
      expect(covered.every((point) => point.matched.length > 0)).toBe(true);
    });

    it("copes with an outline that has no bullets", () => {
      const result = analyseAnswer({
        transcript: "I added an index.",
        question: question({ answer_outline: "Explains the indexing decision" }),
      });

      expect(result.points).toHaveLength(1);
    });
  });

  describe("concrete detail", () => {
    it("picks out figures, durations and named systems", () => {
      const result = analyseAnswer({
        transcript: STRONG,
        question: question(),
      });

      expect(result.specifics.length).toBeGreaterThan(2);
      expect(result.specifics.some((entry) => /120/.test(entry))).toBe(true);
    });

    it("calls out an answer with nothing concrete in it", () => {
      const result = analyseAnswer({
        transcript:
          "I looked at the query and I improved it. It got a lot faster afterwards and everyone was happy with the outcome.",
        question: question(),
      });

      expect(result.specifics).toEqual([]);
      expect(result.notes.join(" ")).toContain("Nothing concrete");
    });
  });

  describe("the STAR arc on behavioural questions", () => {
    const behavioural = question({
      category: "behavioural",
      answer_outline: "- Describes the disagreement\n- Explains what they did\n- Gives the outcome",
    });

    it("recognises a complete arc", () => {
      const result = analyseAnswer({
        transcript: `
          We were three weeks from a launch and the team wanted to ship without
          load testing. I proposed a two-day delay and ran the tests myself.
          We found a connection leak, and the launch went out with zero incidents
          instead of the 4 we had on the previous release.
        `,
        question: behavioural,
      });

      expect(result.star.applies).toBe(true);
      expect(result.star.situation).toBe(true);
      expect(result.star.action).toBe(true);
      expect(result.star.result).toBe(true);
    });

    it("refuses to count a result nobody can measure", () => {
      const result = analyseAnswer({
        transcript:
          "We were behind schedule. I talked to the team and I rewrote the plan. It improved things a lot and everyone was much happier.",
        question: behavioural,
      });

      // "improved" is there, but with no figure it is a claim, not a result.
      expect(result.star.result).toBe(false);
      expect(result.notes.join(" ")).toContain("No measurable result");
    });

    it("notices when you never say what you personally did", () => {
      const result = analyseAnswer({
        transcript:
          "The team was behind schedule. The team talked about it and the team rewrote the plan, and delivery moved 2 weeks earlier.",
        question: behavioural,
      });

      expect(result.star.action).toBe(false);
      expect(result.notes.join(" ")).toContain("as opposed to the team");
    });

    it("does not mistake a word containing 'ive' for saying 'I've'", () => {
      // "delivery" and "five" both contain the letters; neither is the
      // candidate claiming to have done anything.
      const result = analyseAnswer({
        transcript:
          "The team improved delivery across five services and the outcome was 20 percent faster.",
        question: behavioural,
      });

      expect(result.star.action).toBe(false);
    });

    it("does not apply the arc to a technical question", () => {
      const result = analyseAnswer({
        transcript: STRONG,
        question: question(),
      });

      expect(result.star.applies).toBe(false);
    });
  });

  describe("pacing", () => {
    it("accepts an answer of about the right length", () => {
      const result = analyseAnswer({
        transcript: STRONG,
        question: question(),
        spokenSeconds: 95,
      });

      expect(result.pacing.verdict).toBe("good");
      expect(result.pacing.wordsPerMinute).toBeGreaterThan(0);
    });

    it("flags an answer that runs long", () => {
      const result = analyseAnswer({
        transcript: `${STRONG} ${STRONG} ${STRONG}`,
        question: question(),
        spokenSeconds: 400,
      });

      expect(result.pacing.verdict).toBe("too-long");
      expect(result.notes.join(" ")).toContain("Long:");
    });

    it("flags an answer that stops too early", () => {
      const result = analyseAnswer({
        transcript: "There was no index, so I added one and it got faster.",
        question: question(),
        spokenSeconds: 8,
      });

      expect(result.pacing.verdict).toBe("too-short");
    });

    it("judges a typed answer by length, having no clock", () => {
      const result = analyseAnswer({ transcript: STRONG, question: question() });

      expect(result.pacing.spokenSeconds).toBeNull();
      expect(result.pacing.wordsPerMinute).toBeNull();
      expect(result.pacing.verdict).not.toBe("unknown");
    });

    it("gives system design a longer target than a fit question", () => {
      const design = analyseAnswer({
        transcript: STRONG,
        question: question({ category: "system-design" }),
      });
      const fit = analyseAnswer({
        transcript: STRONG,
        question: question({ category: "company-fit" }),
      });

      expect(design.pacing.targetSeconds[1]).toBeGreaterThan(
        fit.pacing.targetSeconds[1],
      );
    });

    it("measures how long the listener waited for anything concrete", () => {
      const result = analyseAnswer({
        transcript: `
          So this is a really interesting question and I want to give some context
          first because I think the background really matters here and it is worth
          explaining how the team was organised and what our priorities were at
          the time and the general shape of the system before I get into it.
          Anyway, the query took 8 seconds.
        `,
        question: question(),
        spokenSeconds: 60,
      });

      expect(result.pacing.secondsToFirstSpecific).toBeGreaterThan(30);
      expect(result.notes.join(" ")).toContain("preamble");
    });
  });

  describe("delivery", () => {
    it("counts filler without banning it", () => {
      const result = analyseAnswer({
        transcript:
          "So um I basically um looked at the um query and uh I um added an index and um it was um faster by 50 percent",
        question: question(),
      });

      expect(result.fillerRatePer100).toBeGreaterThan(5);
      expect(result.fillers[0]?.word).toBe("um");
      expect(result.notes.join(" ")).toContain("Filler is noticeable");
    });

    it("does not complain about the odd filler in a long answer", () => {
      const result = analyseAnswer({
        transcript: `Um, ${STRONG}`,
        question: question(),
      });

      expect(result.notes.join(" ")).not.toContain("Filler is noticeable");
    });

    it("notices hedging that undercuts the answer", () => {
      const result = analyseAnswer({
        transcript:
          "I think it was maybe an index problem, I guess, and I sort of added one and it probably helped by 20 percent.",
        question: question(),
      });

      expect(result.hedges.length).toBeGreaterThanOrEqual(2);
      expect(result.notes.join(" ")).toContain("Hedging");
    });
  });

  describe("the score", () => {
    it("rewards a strong answer", () => {
      const result = analyseAnswer({
        transcript: STRONG,
        question: question(),
        spokenSeconds: 95,
      });

      expect(result.score).toBeGreaterThan(70);
    });

    it("scores an empty answer at nothing", () => {
      expect(
        analyseAnswer({ transcript: "", question: question() }).score,
      ).toBe(0);
      expect(
        analyseAnswer({ transcript: "I don't know.", question: question() }).score,
      ).toBe(0);
    });

    it("puts a vague answer well below a specific one", () => {
      const vague = analyseAnswer({
        transcript:
          "I looked at the query and I improved it using some tools, and it was faster afterwards which was good for everyone involved on the team.",
        question: question(),
        spokenSeconds: 60,
      });
      const strong = analyseAnswer({
        transcript: STRONG,
        question: question(),
        spokenSeconds: 95,
      });

      expect(strong.score - vague.score).toBeGreaterThan(25);
    });

    it("never leaves nought to a hundred", () => {
      const inputs = ["", "um um um", STRONG, `${STRONG} ${STRONG} ${STRONG}`];
      for (const transcript of inputs) {
        const { score } = analyseAnswer({
          transcript,
          question: question(),
          spokenSeconds: 300,
        });
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    });

    it("is stable: the same answer always scores the same", () => {
      const once = analyseAnswer({ transcript: STRONG, question: question() });
      const twice = analyseAnswer({ transcript: STRONG, question: question() });
      expect(once.score).toBe(twice.score);
    });
  });

  it("orders notes worst-first so the interface can show only the top one", () => {
    const result = analyseAnswer({
      transcript: "Um, I think it was slow. I guess I fixed it.",
      question: question(),
      spokenSeconds: 6,
    });

    expect(result.notes[0]).toContain("Missed");
  });
});
