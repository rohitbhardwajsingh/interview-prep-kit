import type { KitSchedule } from "../kit/schema";

/**
 * Civil dates, not instants.
 *
 * "Which day of the plan is today" is a calendar question, and answering it
 * with timestamps gets it wrong twice: once across midnight in the user's own
 * timezone, and once across a daylight-saving boundary where a day is not
 * 24 hours. Every function here works on `YYYY-MM-DD` strings and does its
 * arithmetic in UTC, where a day is always exactly 86,400,000ms.
 */
export type CivilDate = string;

const MS_PER_DAY = 86_400_000;
const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CalendarError extends Error {
  override name = "CalendarError";
}

function assertCivil(value: string): void {
  if (!CIVIL_DATE.test(value)) {
    throw new CalendarError(`Expected a YYYY-MM-DD date, received "${value}"`);
  }
}

/**
 * The calendar date an instant falls on, in a given timezone. The timezone is
 * explicit because the server decides nothing here: a plan belongs to the
 * person following it, and their "today" is the only one that matters.
 */
export function civilDateOf(at: Date, timeZone = "UTC"): CivilDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
  // en-CA already formats as YYYY-MM-DD, which is the shape we want.
  return parts;
}

function toUtcMs(date: CivilDate): number {
  assertCivil(date);
  const [year, month, day] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  return Date.UTC(year, month - 1, day);
}

export function addDays(date: CivilDate, count: number): CivilDate {
  const shifted = new Date(toUtcMs(date) + count * MS_PER_DAY);
  return shifted.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: CivilDate, to: CivilDate): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY);
}

export function weekdayOf(date: CivilDate, timeZone = "UTC"): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "long",
  }).format(new Date(toUtcMs(date)));
}

/**
 * How many study days sit between starting and the interview.
 *
 * The interview day itself is not a study day: nobody learns anything new in
 * the hour before, and pretending otherwise produces a plan whose last entry
 * can never be completed. An interview today or in the past yields zero,
 * which the interface reads as "stop planning, start remembering".
 */
export function studyDaysUntil(
  start: CivilDate,
  interview: CivilDate,
): number {
  return Math.max(0, daysBetween(start, interview));
}

export type DayState = "past" | "today" | "future";

export interface CalendarDay {
  /** The plan's own day number, so this maps onto the kit's schedule. */
  day: number;
  date: CivilDate;
  weekday: string;
  state: DayState;
  /** True for the last planned day, which is the eve of the interview. */
  isEve: boolean;
}

export interface StudyCalendar {
  days: CalendarDay[];
  /** The plan day that is today, or null when today is outside the plan. */
  todayDay: number | null;
  /** Negative once the interview has passed. */
  daysUntilInterview: number;
  /** Planned days that are already behind you. */
  elapsedDays: number;
  interviewDate: CivilDate;
  startDate: CivilDate;
  /** True once the interview is today or gone. */
  isInterviewDay: boolean;
  isPast: boolean;
}

export interface BuildCalendarInput {
  schedule: KitSchedule;
  startDate: CivilDate;
  interviewDate: CivilDate;
  today: CivilDate;
  timeZone?: string;
}

/**
 * Lays the schedule's abstract day numbers onto real dates.
 *
 * A plan that says "Day 3" asks the user to do arithmetic while anxious. The
 * same plan saying "Thursday" does not, and it is the difference between a
 * plan that gets followed and one that gets abandoned.
 */
export function buildCalendar({
  schedule,
  startDate,
  interviewDate,
  today,
  timeZone = "UTC",
}: BuildCalendarInput): StudyCalendar {
  assertCivil(startDate);
  assertCivil(interviewDate);
  assertCivil(today);

  const total = schedule.days.length;
  const days: CalendarDay[] = schedule.days.map((entry, index) => {
    const date = addDays(startDate, index);
    const delta = daysBetween(today, date);
    return {
      day: entry.day,
      date,
      weekday: weekdayOf(date, timeZone),
      state: delta < 0 ? "past" : delta === 0 ? "today" : "future",
      isEve: index === total - 1,
    };
  });

  const todayEntry = days.find((day) => day.state === "today");
  const daysUntilInterview = daysBetween(today, interviewDate);

  return {
    days,
    todayDay: todayEntry?.day ?? null,
    daysUntilInterview,
    elapsedDays: days.filter((day) => day.state === "past").length,
    interviewDate,
    startDate,
    isInterviewDay: daysUntilInterview === 0,
    isPast: daysUntilInterview < 0,
  };
}

/**
 * How the countdown should read. Kept here rather than in the interface so
 * the wording is tested once and cannot drift between the screens that show
 * it.
 */
export function describeCountdown(calendar: StudyCalendar): string {
  const { daysUntilInterview } = calendar;
  if (daysUntilInterview < 0) return "This interview has passed";
  if (daysUntilInterview === 0) return "Your interview is today";
  if (daysUntilInterview === 1) return "Your interview is tomorrow";
  return `${daysUntilInterview} days until your interview`;
}
