import { describe, expect, it } from "vitest";
import {
  MEANINGFUL_GAP,
  MIN_ATTEMPTS_FOR_VERDICT,
  calibrate,
  type ScoredAttempt,
} from "./calibration";

function attempt(overrides: Partial<ScoredAttempt> = {}): ScoredAttempt {
  return {
    questionId: overrides.questionId ?? "q1",
    prompt: overrides.prompt ?? "Tell me about a hard migration.",
    category: overrides.category ?? "behavioural",
    selfRating: overrides.selfRating ?? 3,
    measuredScore: overrides.measuredScore ?? 50,
  };
}

/** Distinct question ids, so nothing is collapsed by the latest-attempt rule. */
function spread(each: Partial<ScoredAttempt>, count: number): ScoredAttempt[] {
  return Array.from({ length: count }, (_unused, index) =>
    attempt({ ...each, questionId: `q${index + 1}` }),
  );
}

describe("calibrate", () => {
  it("says nothing at all until there is something to say", () => {
    const calibration = calibrate([]);

    expect(calibration.attempts).toBe(0);
    expect(calibration.verdict).toBe("unknown");
    expect(calibration.summary).toContain("out loud");
  });

  it("withholds a verdict until a trend could not be a coincidence", () => {
    const calibration = calibrate(
      spread({ selfRating: 5, measuredScore: 20 }, MIN_ATTEMPTS_FOR_VERDICT - 1),
    );

    expect(calibration.verdict).toBe("unknown");
    expect(calibration.summary).toMatch(/more answered question/);
  });

  it("calls out a candidate who rates themselves above what they said", () => {
    const calibration = calibrate(
      spread({ selfRating: 5, measuredScore: 40 }, 4),
    );

    expect(calibration.verdict).toBe("overconfident");
    expect(calibration.averageGap).toBe(50);
    expect(calibration.summary).toContain("weaker than they feel");
  });

  it("reassures a candidate who is doing better than they think", () => {
    const calibration = calibrate(
      spread({ selfRating: 2, measuredScore: 80 }, 4),
    );

    expect(calibration.verdict).toBe("underconfident");
    expect(calibration.averageGap).toBe(-50);
    expect(calibration.summary).toContain("further along than the feeling");
  });

  it("leaves an ordinary estimate alone", () => {
    const calibration = calibrate(
      spread({ selfRating: 4, measuredScore: 62 }, 4),
    );

    expect(calibration.verdict).toBe("calibrated");
    expect(Math.abs(calibration.averageGap)).toBeLessThan(MEANINGFUL_GAP);
    expect(calibration.summary).toContain("Trust it");
  });

  it("ranks blind spots worst first", () => {
    const calibration = calibrate([
      attempt({ questionId: "a", selfRating: 5, measuredScore: 20 }),
      attempt({ questionId: "b", selfRating: 5, measuredScore: 45 }),
    ]);

    expect(calibration.blindSpots.map((spot) => spot.questionId)).toEqual([
      "a",
      "b",
    ]);
    expect(calibration.blindSpots[0]?.gap).toBe(70);
  });

  it("does not call a well-answered question a blind spot", () => {
    const calibration = calibrate(
      spread({ selfRating: 3, measuredScore: 85 }, 3),
    );

    expect(calibration.blindSpots).toEqual([]);
  });

  it("leaves a merely overrated answer off the list when it would still land", () => {
    // Claimed 90, scored 70: a 20-point gap, and an answer that works.
    const calibration = calibrate(
      spread({ selfRating: 5, measuredScore: 70 }, 3),
    );

    expect(calibration.verdict).toBe("overconfident");
    expect(calibration.blindSpots).toEqual([]);
  });

  it("counts only the most recent attempt at a question", () => {
    const calibration = calibrate([
      attempt({ questionId: "a", selfRating: 5, measuredScore: 10 }),
      attempt({ questionId: "a", selfRating: 5, measuredScore: 90 }),
    ]);

    expect(calibration.attempts).toBe(1);
    expect(calibration.averageMeasured).toBe(90);
    expect(calibration.blindSpots).toEqual([]);
  });

  it("finds the category the gap actually lives in", () => {
    const calibration = calibrate([
      attempt({ questionId: "a", category: "technical", selfRating: 5, measuredScore: 85 }),
      attempt({ questionId: "b", category: "technical", selfRating: 5, measuredScore: 90 }),
      attempt({ questionId: "c", category: "behavioural", selfRating: 5, measuredScore: 20 }),
      attempt({ questionId: "d", category: "behavioural", selfRating: 5, measuredScore: 25 }),
    ]);

    expect(calibration.byCategory[0]?.category).toBe("behavioural");
    expect(calibration.byCategory[0]?.averageGap).toBe(68);
    expect(calibration.summary).toContain("behavioural");
  });

  it("does not name a worst category when there is only one", () => {
    const calibration = calibrate(
      spread({ category: "technical", selfRating: 5, measuredScore: 30 }, 3),
    );

    expect(calibration.summary).not.toContain("Worst on");
  });

  it("reports both sides of the comparison, not just the gap", () => {
    const calibration = calibrate(
      spread({ selfRating: 4, measuredScore: 30 }, 3),
    );

    expect(calibration.averageClaimed).toBe(70);
    expect(calibration.averageMeasured).toBe(30);
    expect(calibration.averageGap).toBe(40);
  });

  it("survives a self-rating outside the scale", () => {
    const calibration = calibrate(
      spread({ selfRating: 9, measuredScore: 50 }, 3),
    );

    // Treated as the top of the scale rather than throwing or scoring wildly.
    expect(calibration.averageClaimed).toBe(90);
  });

  it("keeps a perfect answer from becoming a negative blind spot", () => {
    const calibration = calibrate([
      attempt({ questionId: "a", selfRating: 1, measuredScore: 100 }),
    ]);

    expect(calibration.blindSpots).toEqual([]);
    expect(calibration.averageGap).toBe(-90);
  });
});
