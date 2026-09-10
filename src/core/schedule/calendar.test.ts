import { describe, expect, it } from "vitest";
import { buildKit } from "../testing/builders";
import {
  addDays,
  buildCalendar,
  civilDateOf,
  daysBetween,
  describeCountdown,
  studyDaysUntil,
  weekdayOf,
  CalendarError,
} from "./calendar";

describe("civil date arithmetic", () => {
  it("adds days across a month boundary", () => {
    expect(addDays("2026-01-30", 3)).toBe("2026-02-02");
  });

  it("adds days across a year boundary", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });

  it("handles a leap day", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-02-29", 1)).toBe("2028-03-01");
  });

  it("subtracts with a negative count", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("counts whole days between dates", () => {
    expect(daysBetween("2026-09-10", "2026-09-17")).toBe(7);
    expect(daysBetween("2026-09-17", "2026-09-10")).toBe(-7);
    expect(daysBetween("2026-09-10", "2026-09-10")).toBe(0);
  });

  it("is unaffected by a daylight-saving change", () => {
    // The UK moves its clocks on 2026-03-29, so this span contains a 23-hour
    // day. Counting in local time would return 6.958… and round wrong.
    expect(daysBetween("2026-03-27", "2026-03-31")).toBe(4);
  });

  it("refuses a value that is not a civil date", () => {
    expect(() => addDays("2026-9-1", 1)).toThrow(CalendarError);
    expect(() => daysBetween("yesterday", "2026-09-01")).toThrow(CalendarError);
  });

  it("names the weekday", () => {
    expect(weekdayOf("2026-09-10")).toBe("Thursday");
  });
});

describe("civilDateOf", () => {
  it("reads the date in the timezone it is given, not the server's", () => {
    // 23:30 UTC is already tomorrow in Sydney and still today in London.
    const at = new Date("2026-09-10T23:30:00Z");
    expect(civilDateOf(at, "Europe/London")).toBe("2026-09-11");
    expect(civilDateOf(at, "Australia/Sydney")).toBe("2026-09-11");
    expect(civilDateOf(at, "America/Los_Angeles")).toBe("2026-09-10");
  });

  it("puts an early-morning instant on the previous day further west", () => {
    const at = new Date("2026-09-10T02:00:00Z");
    expect(civilDateOf(at, "UTC")).toBe("2026-09-10");
    expect(civilDateOf(at, "America/New_York")).toBe("2026-09-09");
  });
});

describe("studyDaysUntil", () => {
  it("excludes the interview day itself", () => {
    // Interview Friday, starting Monday: Mon–Thu are study days.
    expect(studyDaysUntil("2026-09-07", "2026-09-11")).toBe(4);
  });

  it("gives one day when the interview is tomorrow", () => {
    expect(studyDaysUntil("2026-09-10", "2026-09-11")).toBe(1);
  });

  it("gives nothing when the interview is today", () => {
    expect(studyDaysUntil("2026-09-10", "2026-09-10")).toBe(0);
  });

  it("never goes negative for an interview already past", () => {
    expect(studyDaysUntil("2026-09-10", "2026-09-01")).toBe(0);
  });
});

describe("buildCalendar", () => {
  const schedule = buildKit({ daysAvailable: 4 }).schedule;

  function calendar(today: string) {
    return buildCalendar({
      schedule,
      startDate: "2026-09-07",
      interviewDate: "2026-09-11",
      today,
    });
  }

  it("lays each plan day onto a real date", () => {
    const result = calendar("2026-09-07");
    expect(result.days.map((day) => day.date)).toEqual([
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
    ]);
    expect(result.days.map((day) => day.weekday)).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
    ]);
  });

  it("keeps the schedule's own day numbers, so it maps back onto the kit", () => {
    expect(calendar("2026-09-07").days.map((day) => day.day)).toEqual(
      schedule.days.map((day) => day.day),
    );
  });

  it("marks which day is today", () => {
    const result = calendar("2026-09-09");
    expect(result.todayDay).toBe(3);
    expect(result.days.map((day) => day.state)).toEqual([
      "past",
      "past",
      "today",
      "future",
    ]);
    expect(result.elapsedDays).toBe(2);
  });

  it("reports no current day when today is before the plan starts", () => {
    const result = calendar("2026-09-05");
    expect(result.todayDay).toBeNull();
    expect(result.days.every((day) => day.state === "future")).toBe(true);
  });

  it("marks the last planned day as the eve of the interview", () => {
    const result = calendar("2026-09-07");
    const eve = result.days.filter((day) => day.isEve);
    expect(eve).toHaveLength(1);
    expect(eve[0]?.date).toBe("2026-09-10");
    // Which is the day before the interview, never the interview itself.
    expect(addDays(eve[0]?.date ?? "", 1)).toBe("2026-09-11");
  });

  it("knows when the interview is today", () => {
    const result = calendar("2026-09-11");
    expect(result.isInterviewDay).toBe(true);
    expect(result.isPast).toBe(false);
    expect(result.daysUntilInterview).toBe(0);
    // Every study day is behind you by then.
    expect(result.elapsedDays).toBe(4);
  });

  it("knows when the interview has gone", () => {
    const result = calendar("2026-09-14");
    expect(result.isPast).toBe(true);
    expect(result.daysUntilInterview).toBe(-3);
  });
});

describe("describeCountdown", () => {
  function at(today: string) {
    return describeCountdown(
      buildCalendar({
        schedule: buildKit({ daysAvailable: 3 }).schedule,
        startDate: "2026-09-08",
        interviewDate: "2026-09-11",
        today,
      }),
    );
  }

  it("counts down in plain words", () => {
    expect(at("2026-09-08")).toBe("3 days until your interview");
    expect(at("2026-09-10")).toBe("Your interview is tomorrow");
    expect(at("2026-09-11")).toBe("Your interview is today");
    expect(at("2026-09-12")).toBe("This interview has passed");
  });
});
