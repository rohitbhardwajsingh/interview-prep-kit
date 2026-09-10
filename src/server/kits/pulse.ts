import { untrackKit } from "../../core/kit/tracked";
import type { ReviewState } from "../../core/practice/leitner";
import { scoreReadiness } from "../../core/readiness/score";
import { evidencedRequirementIds, kitCalendar } from "./derive";
import type { KitRecord } from "./types";

/**
 * The vital signs of one kit, small enough to send a screenful of them at
 * once. This is what turns the list from a set of links into a dashboard: the
 * countdown and the readiness score are the two things that decide which kit
 * the user should open, and computing them here means they do not have to
 * open one to find out.
 */
export interface KitPulse {
  readiness: number;
  band: string;
  nextAction: string;
  daysUntilInterview: number;
  isInterviewDay: boolean;
  isPast: boolean;
  questionsTotal: number;
  questionsSeen: number;
}

export function kitPulse(
  record: KitRecord,
  reviews: readonly ReviewState[],
  now: Date,
): KitPulse | null {
  if (!record.kit) return null;

  const kit = untrackKit(record.kit);
  const calendar = kitCalendar(record, kit, now);
  const readiness = scoreReadiness({
    requirements: kit.role.requirements,
    questions: kit.questions,
    reviews,
    evidencedRequirementIds: evidencedRequirementIds(record, kit),
  });

  const seen = new Set(
    reviews.filter((state) => state.timesSeen > 0).map((state) => state.questionId),
  );

  return {
    readiness: readiness.score,
    band: readiness.band,
    nextAction: readiness.nextAction,
    daysUntilInterview: calendar.daysUntilInterview,
    isInterviewDay: calendar.isInterviewDay,
    isPast: calendar.isPast,
    questionsTotal: kit.questions.length,
    questionsSeen: kit.questions.filter((question) => seen.has(question.id)).length,
  };
}
