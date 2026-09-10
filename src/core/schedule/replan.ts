import type { KitQuestion, KitRequirement, KitSchedule } from "../kit/schema";
import { allocateSchedule } from "./allocate";
import { orderByStudyPriority, questionMinutes } from "./effort";

/**
 * The most study a plan will ask of someone in one day before it admits the
 * plan is unrealistic. Above this, people stop opening the app rather than
 * working harder, so the honest move is to cut scope or say so.
 */
export const SUSTAINABLE_DAILY_MINUTES = 90;

export interface ReplanInput {
  questions: readonly KitQuestion[];
  requirements: readonly KitRequirement[];
  /** Questions already practised at least once. */
  completedQuestionIds: readonly string[];
  /** Study days left, excluding the interview day. */
  daysRemaining: number;
  /** Overrides the daily ceiling, for someone who genuinely has more time. */
  dailyMinuteBudget?: number;
}

export interface ReplanReport {
  /** Outstanding questions the new plan has to fit. */
  carriedOver: number;
  alreadyDone: number;
  /** Nice-to-have questions cut to make the remaining days achievable. */
  deferredQuestionIds: string[];
  /** Heaviest day in the new plan. */
  peakDayMinutes: number;
  /** True when even must-haves alone will not fit comfortably. */
  overloaded: boolean;
  /** Plain-language account of what changed, for the interface to show. */
  summary: string;
}

export interface ReplanResult {
  schedule: KitSchedule;
  report: ReplanReport;
}

function peakMinutes(schedule: KitSchedule): number {
  return schedule.days.reduce((highest, day) => Math.max(highest, day.minutes), 0);
}

function coversAMustHave(
  question: KitQuestion,
  mustIds: ReadonlySet<string>,
): boolean {
  return question.requirement_ids.some((id) => mustIds.has(id));
}

function sentence(report: Omit<ReplanReport, "summary">, days: number): string {
  if (report.carriedOver === 0) {
    return "You are through everything this kit had. What is left is review.";
  }

  const load = `${report.carriedOver} question${report.carriedOver === 1 ? "" : "s"} across ${days} day${days === 1 ? "" : "s"}`;
  const deferred = report.deferredQuestionIds.length;
  const setAside = `${deferred} nice-to-have question${deferred === 1 ? " was" : "s were"} set aside`;

  // Deferring and still overflowing are independent, and reporting only the
  // first reads as reassurance the plan has not earned.
  if (deferred > 0 && report.overloaded) {
    return `${load}. ${setAside}, and it is still more than fits comfortably — the rest is all must-have.`;
  }

  if (deferred > 0) return `${load}. ${setAside} so the must-haves fit.`;

  if (report.overloaded) {
    return `${load}. That is more than fits comfortably, and all of it is must-have, so nothing was cut.`;
  }

  return `${load}.`;
}

/**
 * Recuts the plan around the days that are actually left.
 *
 * Every study plan makes the same promise and breaks it the same way: it is
 * written once, the user misses two days, and from then on it describes a
 * past that did not happen. Rather than showing them a backlog they will
 * never clear, this throws the old plan away and allocates what remains over
 * the days that remain — the same allocator, on a smaller problem.
 *
 * When it will not fit, nice-to-have material is deferred before must-have
 * material, and if the must-haves alone still overflow it says so instead of
 * quietly producing a four-hour Tuesday.
 */
export function replanSchedule(input: ReplanInput): ReplanResult {
  const budget = input.dailyMinuteBudget ?? SUSTAINABLE_DAILY_MINUTES;
  const done = new Set(input.completedQuestionIds);
  const outstanding = input.questions.filter(
    (question) => !done.has(question.id),
  );

  // No days left is not an error: it is the eve of the interview, and the
  // right answer is an empty plan rather than a crammed one.
  const days = Math.max(0, Math.trunc(input.daysRemaining));
  if (days === 0 || outstanding.length === 0) {
    const schedule = allocateSchedule({
      daysAvailable: Math.max(1, days),
      questions: outstanding,
      requirements: input.requirements,
    });
    const base = {
      carriedOver: outstanding.length,
      alreadyDone: done.size,
      deferredQuestionIds: [],
      peakDayMinutes: peakMinutes(schedule),
      overloaded: days === 0 && outstanding.length > 0,
    };
    return { schedule, report: { ...base, summary: sentence(base, days) } };
  }

  const mustIds = new Set(
    input.requirements
      .filter((requirement) => requirement.priority === "must")
      .map((requirement) => requirement.id),
  );

  // Deferred from the back of the study order, which already puts
  // nice-to-have and easier material last.
  const ordered = orderByStudyPriority(outstanding, input.requirements);
  const capacity = budget * days;
  const kept = [...ordered];
  const deferred: KitQuestion[] = [];

  let load = kept.reduce((sum, question) => sum + questionMinutes(question), 0);
  for (let index = kept.length - 1; index >= 0 && load > capacity; index -= 1) {
    const question = kept[index];
    if (!question || coversAMustHave(question, mustIds)) continue;
    kept.splice(index, 1);
    deferred.unshift(question);
    load -= questionMinutes(question);
  }

  const schedule = allocateSchedule({
    daysAvailable: days,
    questions: kept,
    requirements: input.requirements,
  });

  const base = {
    carriedOver: kept.length,
    alreadyDone: done.size,
    deferredQuestionIds: deferred.map((question) => question.id),
    peakDayMinutes: peakMinutes(schedule),
    overloaded: load > capacity,
  };

  return { schedule, report: { ...base, summary: sentence(base, days) } };
}
