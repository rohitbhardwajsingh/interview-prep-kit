import { describe, expect, it } from "vitest";
import { ScheduleAllocationError, allocateSchedule } from "./allocate";
import { buildQuestion, buildRequirement } from "../testing/builders";
import type { KitQuestion, KitRequirement } from "../kit/schema";

function questionSet(count: number): KitQuestion[] {
  return Array.from({ length: count }, (_unused, index) =>
    buildQuestion(`q${index + 1}`, [`r${index + 1}`], {
      difficulty: ((index % 3) + 1) as 1 | 2 | 3,
    }),
  );
}

function requirementSet(count: number): KitRequirement[] {
  return Array.from({ length: count }, (_unused, index) =>
    buildRequirement(`r${index + 1}`),
  );
}

describe("allocateSchedule", () => {
  it.each([1, 2, 3, 5, 7, 14, 30, 60])(
    "spans exactly %i day(s)",
    (daysAvailable) => {
      const schedule = allocateSchedule({
        daysAvailable,
        questions: questionSet(12),
        requirements: requirementSet(12),
      });

      expect(schedule.days).toHaveLength(daysAvailable);
      expect(schedule.days_available).toBe(daysAvailable);
      expect(schedule.days.map((day) => day.day)).toEqual(
        Array.from({ length: daysAvailable }, (_unused, index) => index + 1),
      );
    },
  );

  it("places every question at least once", () => {
    const questions = questionSet(11);
    const schedule = allocateSchedule({
      daysAvailable: 4,
      questions,
      requirements: requirementSet(11),
    });

    const scheduled = new Set(schedule.days.flatMap((day) => day.question_ids));
    for (const question of questions) {
      expect(scheduled.has(question.id)).toBe(true);
    }
  });

  it("puts the whole bank on day one when only one day is available", () => {
    const questions = questionSet(20);
    const schedule = allocateSchedule({
      daysAvailable: 1,
      questions,
      requirements: requirementSet(20),
    });

    expect(schedule.days[0]?.question_ids).toHaveLength(20);
  });

  it("leads with must-have material ahead of nice-to-have material", () => {
    const requirements = [
      buildRequirement("r1", { priority: "nice" }),
      buildRequirement("r2", { priority: "must" }),
    ];
    const questions = [
      buildQuestion("q-nice", ["r1"], { difficulty: 3 }),
      buildQuestion("q-must", ["r2"], { difficulty: 1 }),
    ];

    const schedule = allocateSchedule({ daysAvailable: 2, questions, requirements });

    expect(schedule.days[0]?.question_ids).toEqual(["q-must"]);
  });

  it("leads with the harder question when priority is equal", () => {
    const requirements = requirementSet(2);
    const questions = [
      buildQuestion("q-easy", ["r1"], { difficulty: 1 }),
      buildQuestion("q-hard", ["r2"], { difficulty: 3 }),
    ];

    const schedule = allocateSchedule({ daysAvailable: 2, questions, requirements });

    expect(schedule.days[0]?.question_ids).toEqual(["q-hard"]);
  });

  it("fills a long runway with review days instead of dropping days", () => {
    const schedule = allocateSchedule({
      daysAvailable: 60,
      questions: questionSet(20),
      requirements: requirementSet(20),
    });

    const reviewDays = schedule.days.filter((day) =>
      day.focus.startsWith("Review"),
    );

    expect(schedule.days).toHaveLength(60);
    expect(reviewDays.length).toBeGreaterThan(0);
    for (const day of schedule.days) {
      expect(day.question_ids.length).toBeGreaterThan(0);
    }
  });

  it("never repeats a question within a single day", () => {
    const schedule = allocateSchedule({
      daysAvailable: 30,
      questions: questionSet(3),
      requirements: requirementSet(3),
    });

    for (const day of schedule.days) {
      expect(new Set(day.question_ids).size).toBe(day.question_ids.length);
    }
  });

  it("reports integer minutes above zero on every day", () => {
    const schedule = allocateSchedule({
      daysAvailable: 9,
      questions: questionSet(14),
      requirements: requirementSet(14),
    });

    for (const day of schedule.days) {
      expect(Number.isInteger(day.minutes)).toBe(true);
      expect(day.minutes).toBeGreaterThan(0);
    }
  });

  it("still spans the requested days when nothing could be extracted", () => {
    const schedule = allocateSchedule({
      daysAvailable: 4,
      questions: [],
      requirements: [],
    });

    expect(schedule.days).toHaveLength(4);
    for (const day of schedule.days) {
      expect(day.question_ids).toEqual([]);
      expect(day.focus).toContain("No question material");
    }
  });

  it.each([0, -1, 1.5, Number.NaN])(
    "rejects %s as a day count",
    (daysAvailable) => {
      expect(() =>
        allocateSchedule({
          daysAvailable,
          questions: questionSet(2),
          requirements: requirementSet(2),
        }),
      ).toThrow(ScheduleAllocationError);
    },
  );

  it("is deterministic across repeated runs", () => {
    const input = {
      daysAvailable: 6,
      questions: questionSet(13),
      requirements: requirementSet(13),
    };

    expect(allocateSchedule(input)).toEqual(allocateSchedule(input));
  });
});
