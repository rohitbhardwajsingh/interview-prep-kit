import { checkEvidence } from "../../core/evidence/check";
import type { KitQuestion } from "../../core/kit/schema";
import { untrackKit } from "../../core/kit/tracked";
import type { ReviewState } from "../../core/practice/leitner";
import { scoreReadiness, type Readiness } from "../../core/readiness/score";
import {
  buildCalendar,
  civilDateOf,
  describeCountdown,
  type StudyCalendar,
} from "../../core/schedule/calendar";
import { replanSchedule, type ReplanReport } from "../../core/schedule/replan";
import type { KitScheduleDay } from "../../core/kit/schema";
import type { KitRecord } from "./types";

export interface TodayInput {
  record: KitRecord;
  reviews: readonly ReviewState[];
  now: Date;
}

export interface TodayView {
  calendar: StudyCalendar;
  countdown: string;
  readiness: Readiness;
  /** What to do today, after replanning around whatever was missed. */
  plan: KitScheduleDay | null;
  questions: KitQuestion[];
  replan: ReplanReport;
  /** True when the plan on disk no longer matches the days that are left. */
  behind: boolean;
}

/**
 * Everything the home screen needs, computed rather than stored.
 *
 * Deriving this on read means a plan cannot go stale between visits: close
 * the app on Monday, open it on Thursday, and the answer to "what now" is
 * recomputed from the days that are actually left rather than replayed from
 * a plan written before you fell behind.
 */
export function todayView({
  record,
  reviews,
  now,
}: TodayInput): TodayView | null {
  if (!record.kit) return null;

  const kit = untrackKit(record.kit);
  const timeZone = record.timeZone ?? "UTC";
  const today = civilDateOf(now, timeZone);

  // Kits made before dates were asked for still work: they are treated as
  // having started when they were created.
  const startDate = record.startDate ?? civilDateOf(record.createdAt, timeZone);
  const interviewDate =
    record.interviewDate ??
    civilDateOf(
      new Date(record.createdAt.getTime() + kit.schedule.days_available * 86_400_000),
      timeZone,
    );

  const calendar = buildCalendar({
    schedule: kit.schedule,
    startDate,
    interviewDate,
    today,
    timeZone,
  });

  // A question counts as done once it has been answered at all; the Leitner
  // box then decides how well, which readiness reads separately.
  const completedQuestionIds = reviews
    .filter((state) => state.timesSeen > 0)
    .map((state) => state.questionId);

  const { schedule, report } = replanSchedule({
    questions: kit.questions,
    requirements: kit.role.requirements,
    completedQuestionIds,
    daysRemaining: Math.max(0, calendar.daysUntilInterview),
  });

  const plan = schedule.days[0] ?? null;
  const byId = new Map(kit.questions.map((question) => [question.id, question]));
  const questions = (plan?.question_ids ?? [])
    .map((id) => byId.get(id))
    .filter((question): question is KitQuestion => question !== undefined);

  // Evidence only counts towards readiness once the user has actually linked
  // something, so an unused story bank stays out of the score.
  const evidence =
    record.evidenceLinks.length > 0
      ? checkEvidence(
          kit.role.requirements,
          kit.questions,
          record.evidenceLinks,
        )
      : null;

  const evidencedRequirementIds = evidence
    ? kit.role.requirements
        .map((requirement) => requirement.id)
        .filter(
          (id) => !evidence.unevidenced_requirement_ids.includes(id),
        )
    : undefined;

  return {
    calendar,
    countdown: describeCountdown(calendar),
    readiness: scoreReadiness({
      requirements: kit.role.requirements,
      questions: kit.questions,
      reviews,
      evidencedRequirementIds,
    }),
    plan,
    questions,
    replan: report,
    behind: report.carriedOver > 0 && calendar.elapsedDays > 0,
  };
}
