import { describe, expect, it } from "vitest";
import type { KitQuestion } from "../kit/schema";
import { buildQuestion, buildRequirement } from "../testing/builders";
import { questionMinutes } from "./effort";
import { replanSchedule, SUSTAINABLE_DAILY_MINUTES } from "./replan";

const REQUIREMENTS = [
  buildRequirement("r1", { priority: "must" }),
  buildRequirement("r2", { priority: "must" }),
  buildRequirement("r3", { priority: "nice" }),
];

/** Six questions: four on must-haves, two on the nice-to-have. */
const QUESTIONS: KitQuestion[] = [
  buildQuestion("q1", ["r1"], { difficulty: 3 }),
  buildQuestion("q2", ["r1"], { difficulty: 2 }),
  buildQuestion("q3", ["r2"], { difficulty: 3 }),
  buildQuestion("q4", ["r2"], { difficulty: 1 }),
  buildQuestion("q5", ["r3"], { difficulty: 2 }),
  buildQuestion("q6", ["r3"], { difficulty: 1 }),
];

function scheduledIds(schedule: { days: { question_ids: string[] }[] }) {
  return new Set(schedule.days.flatMap((day) => day.question_ids));
}

describe("replanSchedule", () => {
  it("plans only what is still outstanding", () => {
    const { schedule, report } = replanSchedule({
      questions: QUESTIONS,
      requirements: REQUIREMENTS,
      completedQuestionIds: ["q1", "q2"],
      daysRemaining: 3,
    });

    expect(report.alreadyDone).toBe(2);
    expect(report.carriedOver).toBe(4);

    const planned = scheduledIds(schedule);
    expect(planned.has("q1")).toBe(false);
    expect(planned.has("q2")).toBe(false);
    expect(planned.has("q3")).toBe(true);
  });

  it("spans exactly the days that are left", () => {
    const { schedule } = replanSchedule({
      questions: QUESTIONS,
      requirements: REQUIREMENTS,
      completedQuestionIds: [],
      daysRemaining: 4,
    });

    expect(schedule.days_available).toBe(4);
    expect(schedule.days).toHaveLength(4);
    expect(schedule.days.map((day) => day.day)).toEqual([1, 2, 3, 4]);
  });

  it("does not care how far behind you fell, only what is left", () => {
    // Two people, same outstanding work, different histories: the plan they
    // are shown from here is identical.
    const fresh = replanSchedule({
      questions: QUESTIONS.slice(2),
      requirements: REQUIREMENTS,
      completedQuestionIds: [],
      daysRemaining: 2,
    });
    const behind = replanSchedule({
      questions: QUESTIONS,
      requirements: REQUIREMENTS,
      completedQuestionIds: ["q1", "q2"],
      daysRemaining: 2,
    });

    expect(scheduledIds(behind.schedule)).toEqual(scheduledIds(fresh.schedule));
  });

  describe("when there is more work than time", () => {
    it("defers nice-to-have questions before must-have ones", () => {
      const { schedule, report } = replanSchedule({
        questions: QUESTIONS,
        requirements: REQUIREMENTS,
        completedQuestionIds: [],
        daysRemaining: 1,
        dailyMinuteBudget: 40,
      });

      expect(report.deferredQuestionIds).toEqual(["q5", "q6"]);

      const planned = scheduledIds(schedule);
      expect(planned.has("q5")).toBe(false);
      // Every must-have question survives the cut.
      for (const id of ["q1", "q2", "q3", "q4"]) {
        expect(planned.has(id)).toBe(true);
      }
    });

    it("keeps nice-to-haves when they do fit", () => {
      const { report } = replanSchedule({
        questions: QUESTIONS,
        requirements: REQUIREMENTS,
        completedQuestionIds: [],
        daysRemaining: 5,
      });

      expect(report.deferredQuestionIds).toEqual([]);
      expect(report.overloaded).toBe(false);
    });

    it("admits an overload rather than cutting must-have material", () => {
      const { schedule, report } = replanSchedule({
        questions: QUESTIONS,
        requirements: REQUIREMENTS,
        completedQuestionIds: [],
        daysRemaining: 1,
        dailyMinuteBudget: 20,
      });

      expect(report.overloaded).toBe(true);
      // The must-haves are still there: you need them, however tight it is.
      const planned = scheduledIds(schedule);
      for (const id of ["q1", "q2", "q3", "q4"]) {
        expect(planned.has(id)).toBe(true);
      }
      // Says both things, because both are true.
      expect(report.summary).toContain("set aside");
      expect(report.summary).toContain("still more than fits");
    });

    it("says nothing was cut when the overflow is pure must-have", () => {
      const mustOnly = QUESTIONS.filter((question) =>
        question.requirement_ids.some((id) => id !== "r3"),
      );

      const { report } = replanSchedule({
        questions: mustOnly,
        requirements: REQUIREMENTS,
        completedQuestionIds: [],
        daysRemaining: 1,
        dailyMinuteBudget: 20,
      });

      expect(report.deferredQuestionIds).toEqual([]);
      expect(report.summary).toContain("nothing was cut");
    });

    it("defers the least valuable work first, not simply the last", () => {
      // Total is 100 minutes; a 90 budget should cost exactly the easiest
      // nice-to-have and nothing more.
      const total = QUESTIONS.reduce(
        (sum, question) => sum + questionMinutes(question),
        0,
      );
      expect(total).toBe(100);

      const { report } = replanSchedule({
        questions: QUESTIONS,
        requirements: REQUIREMENTS,
        completedQuestionIds: [],
        daysRemaining: 1,
        dailyMinuteBudget: 90,
      });

      expect(report.deferredQuestionIds).toEqual(["q6"]);
    });
  });

  describe("at the edges", () => {
    it("returns an empty plan on the eve of the interview", () => {
      const { schedule, report } = replanSchedule({
        questions: QUESTIONS,
        requirements: REQUIREMENTS,
        completedQuestionIds: [],
        daysRemaining: 0,
      });

      expect(schedule.days).toHaveLength(1);
      // Nothing is scheduled, and it says plainly that the time has gone.
      expect(report.overloaded).toBe(true);
    });

    it("says you are done when everything is practised", () => {
      const { report } = replanSchedule({
        questions: QUESTIONS,
        requirements: REQUIREMENTS,
        completedQuestionIds: QUESTIONS.map((question) => question.id),
        daysRemaining: 3,
      });

      expect(report.carriedOver).toBe(0);
      expect(report.summary).toContain("What is left is review");
    });

    it("copes with a kit that produced no questions at all", () => {
      const { schedule, report } = replanSchedule({
        questions: [],
        requirements: REQUIREMENTS,
        completedQuestionIds: [],
        daysRemaining: 3,
      });

      expect(schedule.days).toHaveLength(3);
      expect(report.carriedOver).toBe(0);
    });

    it("ignores a completed id that is not in the kit", () => {
      const { report } = replanSchedule({
        questions: QUESTIONS,
        requirements: REQUIREMENTS,
        completedQuestionIds: ["q1", "not-a-question"],
        daysRemaining: 3,
      });

      expect(report.carriedOver).toBe(5);
    });
  });

  it("reports the heaviest day so the interface can warn about it", () => {
    const { schedule, report } = replanSchedule({
      questions: QUESTIONS,
      requirements: REQUIREMENTS,
      completedQuestionIds: [],
      daysRemaining: 2,
    });

    const heaviest = Math.max(...schedule.days.map((day) => day.minutes));
    expect(report.peakDayMinutes).toBe(heaviest);
  });

  it("defaults to a sustainable daily load", () => {
    const many = Array.from({ length: 40 }, (_unused, index) =>
      buildQuestion(`x${index}`, ["r3"], { difficulty: 3 }),
    );

    const { report } = replanSchedule({
      questions: many,
      requirements: REQUIREMENTS,
      completedQuestionIds: [],
      daysRemaining: 2,
    });

    // 40 hard questions in two days is not a plan, so most are deferred.
    expect(report.deferredQuestionIds.length).toBeGreaterThan(0);
    expect(report.peakDayMinutes).toBeLessThanOrEqual(
      SUSTAINABLE_DAILY_MINUTES * 1.5,
    );
  });
});
