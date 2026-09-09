import { describe, expect, it } from "vitest";
import {
  BOX_INTERVALS_DAYS,
  MAX_BOX,
  buildQueue,
  initialState,
  nextBox,
  review,
  summarise,
  type Confidence,
  type ReviewState,
} from "./leitner";

const OPTIONS = { today: 1, daysAvailable: 14 };

function state(overrides: Partial<ReviewState> = {}): ReviewState {
  return { ...initialState("q1"), ...overrides };
}

describe("nextBox", () => {
  it("promotes a confident answer", () => {
    expect(nextBox(1, 4)).toBe(2);
    expect(nextBox(1, 5)).toBe(2);
  });

  it("holds a middling answer where it is", () => {
    expect(nextBox(2, 3)).toBe(2);
  });

  it("sends a failed answer back to the start rather than down one", () => {
    // An item you could not answer is unlearned, not slightly less known.
    expect(nextBox(4, 1)).toBe(0);
    expect(nextBox(4, 2)).toBe(0);
  });

  it("does not promote past the last box", () => {
    expect(nextBox(MAX_BOX, 5)).toBe(MAX_BOX);
  });
});

describe("review", () => {
  it("schedules a promoted item by its new box interval", () => {
    const result = review(state({ box: 1 }), 5, { ...OPTIONS, today: 3 });

    expect(result.box).toBe(2);
    expect(result.dueOnDay).toBe(3 + (BOX_INTERVALS_DAYS[2] ?? 0));
  });

  it("brings a failed item back the same day", () => {
    const result = review(state({ box: 3 }), 1, { ...OPTIONS, today: 5 });

    expect(result.box).toBe(0);
    expect(result.dueOnDay).toBe(5);
  });

  it("never schedules past the last day of the plan", () => {
    // Due after the interview is the same as never, so it is pulled forward.
    const result = review(state({ box: MAX_BOX - 1 }), 5, {
      today: 6,
      daysAvailable: 7,
    });

    expect(result.dueOnDay).toBe(7);
  });

  it("counts every sighting", () => {
    const once = review(state(), 4, OPTIONS);
    const twice = review(once, 4, OPTIONS);

    expect(twice.timesSeen).toBe(2);
    expect(twice.lastConfidence).toBe(4);
  });
});

describe("buildQueue", () => {
  it("leaves out anything not yet due", () => {
    const queue = buildQueue(
      [
        state({ questionId: "q1", dueOnDay: 1 }),
        state({ questionId: "q2", dueOnDay: 5 }),
      ],
      1,
    );

    expect(queue.map((item) => item.questionId)).toEqual(["q1"]);
  });

  it("puts never-seen items ahead of known weak ones", () => {
    const queue = buildQueue(
      [
        state({ questionId: "seen", timesSeen: 3, box: 1, lastConfidence: 2 }),
        state({ questionId: "fresh", timesSeen: 0 }),
      ],
      1,
    );

    expect(queue.map((item) => item.questionId)).toEqual(["fresh", "seen"]);
  });

  it("orders seen items weakest first", () => {
    const queue = buildQueue(
      [
        state({ questionId: "strong", timesSeen: 1, box: 4 }),
        state({ questionId: "weak", timesSeen: 1, box: 0 }),
        state({ questionId: "middling", timesSeen: 1, box: 2 }),
      ],
      1,
    );

    expect(queue.map((item) => item.questionId)).toEqual([
      "weak",
      "middling",
      "strong",
    ]);
  });

  it("breaks a tie on confidence before anything else", () => {
    const queue = buildQueue(
      [
        state({ questionId: "surer", timesSeen: 1, box: 2, lastConfidence: 4 }),
        state({ questionId: "shakier", timesSeen: 1, box: 2, lastConfidence: 3 }),
      ],
      1,
    );

    expect(queue.map((item) => item.questionId)).toEqual(["shakier", "surer"]);
  });

  it("produces the same order regardless of input order", () => {
    const items = [
      state({ questionId: "a", timesSeen: 1, box: 2, lastConfidence: 3 }),
      state({ questionId: "b", timesSeen: 1, box: 2, lastConfidence: 3 }),
      state({ questionId: "c", timesSeen: 1, box: 2, lastConfidence: 3 }),
    ];

    const forwards = buildQueue(items, 1).map((item) => item.questionId);
    const backwards = buildQueue([...items].reverse(), 1).map(
      (item) => item.questionId,
    );

    expect(forwards).toEqual(backwards);
  });

  it("empties once everything is scheduled for later", () => {
    expect(buildQueue([state({ dueOnDay: 9 })], 3)).toEqual([]);
  });
});

describe("summarise", () => {
  it("counts what is solid, shaky, and still untouched", () => {
    const progress = summarise(
      [
        state({ questionId: "q1", box: MAX_BOX, timesSeen: 4 }),
        state({ questionId: "q2", box: 1, timesSeen: 2 }),
        state({ questionId: "q3" }),
      ],
      1,
    );

    expect(progress).toMatchObject({
      total: 3,
      attempted: 2,
      solid: 1,
      shaky: 1,
    });
  });

  it("does not call an untouched item shaky", () => {
    // Box 0 and never seen are different things and must not be conflated.
    const progress = summarise([state()], 1);

    expect(progress.shaky).toBe(0);
    expect(progress.attempted).toBe(0);
  });

  it("counts a full run through as solid", () => {
    let current = state();
    for (const confidence of [5, 5, 5, 5, 5] as Confidence[]) {
      current = review(current, confidence, OPTIONS);
    }

    expect(summarise([current], 20).solid).toBe(1);
  });
});
