import { QUESTION_CATEGORIES, type QuestionCategory } from "../kit/constants";
import type {
  KitQuestion,
  KitRequirement,
  KitSchedule,
  KitScheduleDay,
} from "../kit/schema";
import {
  MAX_QUESTIONS_PER_STUDY_DAY,
  MIN_DAY_MINUTES,
  orderByStudyPriority,
  reviewMinutes,
  studyMinutes,
} from "./effort";

export const NO_MATERIAL_FOCUS =
  "No question material was extracted from this posting";

const CATEGORY_FOCUS_LABEL: Readonly<Record<QuestionCategory, string>> = {
  technical: "Technical depth",
  behavioural: "Behavioural stories",
  "system-design": "System design",
  "company-fit": "Company fit",
};

export class ScheduleAllocationError extends Error {
  override name = "ScheduleAllocationError";
}

export interface ScheduleAllocationInput {
  daysAvailable: number;
  questions: readonly KitQuestion[];
  requirements: readonly KitRequirement[];
}

function clamp(value: number, lower: number, upper: number): number {
  return Math.min(Math.max(value, lower), upper);
}

function focusLabel(
  questions: readonly KitQuestion[],
  isReview: boolean,
): string {
  if (questions.length === 0) return NO_MATERIAL_FOCUS;

  const counts = new Map<QuestionCategory, number>();
  for (const question of questions) {
    counts.set(question.category, (counts.get(question.category) ?? 0) + 1);
  }

  let dominant: QuestionCategory = QUESTION_CATEGORIES[0];
  let highest = -1;
  for (const category of QUESTION_CATEGORIES) {
    const count = counts.get(category) ?? 0;
    if (count > highest) {
      highest = count;
      dominant = category;
    }
  }

  const label =
    counts.size > 1
      ? `${CATEGORY_FOCUS_LABEL[dominant]} with mixed practice`
      : CATEGORY_FOCUS_LABEL[dominant];

  return isReview ? `Review — ${label}` : label;
}

function emptyDays(daysAvailable: number): KitScheduleDay[] {
  return Array.from({ length: daysAvailable }, (_unused, index) => ({
    day: index + 1,
    focus: NO_MATERIAL_FOCUS,
    question_ids: [],
    minutes: MIN_DAY_MINUTES,
  }));
}

function countStudyDays(questionCount: number, daysAvailable: number): number {
  const targetPerDay = clamp(
    Math.ceil(questionCount / daysAvailable),
    1,
    MAX_QUESTIONS_PER_STUDY_DAY,
  );
  return Math.min(daysAvailable, Math.ceil(questionCount / targetPerDay));
}

function buildStudyDays(
  ordered: readonly KitQuestion[],
  dayCount: number,
): KitScheduleDay[] {
  const base = Math.floor(ordered.length / dayCount);
  const remainder = ordered.length % dayCount;
  const days: KitScheduleDay[] = [];

  let cursor = 0;
  for (let index = 0; index < dayCount; index += 1) {
    const size = base + (index < remainder ? 1 : 0);
    const slice = ordered.slice(cursor, cursor + size);
    cursor += size;
    days.push({
      day: index + 1,
      focus: focusLabel(slice, false),
      question_ids: slice.map((question) => question.id),
      minutes: studyMinutes(slice),
    });
  }

  return days;
}

/**
 * Surplus days become spaced review rather than being dropped, because the
 * schedule has to span exactly the number of days requested. Review cycles
 * through study order, so the hardest must-have material comes round most
 * often on a long runway.
 */
function buildReviewDays(
  ordered: readonly KitQuestion[],
  dayCount: number,
  dayNumberOffset: number,
): KitScheduleDay[] {
  if (dayCount <= 0) return [];

  const perDay = clamp(
    Math.ceil(ordered.length / dayCount),
    1,
    Math.min(MAX_QUESTIONS_PER_STUDY_DAY, ordered.length),
  );
  const days: KitScheduleDay[] = [];

  let cursor = 0;
  for (let index = 0; index < dayCount; index += 1) {
    const slice: KitQuestion[] = [];
    for (let taken = 0; taken < perDay; taken += 1) {
      const question = ordered[cursor % ordered.length];
      cursor += 1;
      if (question) slice.push(question);
    }
    days.push({
      day: dayNumberOffset + index + 1,
      focus: focusLabel(slice, true),
      question_ids: slice.map((question) => question.id),
      minutes: reviewMinutes(slice),
    });
  }

  return days;
}

export function allocateSchedule({
  daysAvailable,
  questions,
  requirements,
}: ScheduleAllocationInput): KitSchedule {
  if (!Number.isInteger(daysAvailable) || daysAvailable < 1) {
    throw new ScheduleAllocationError(
      `days_available must be a positive integer, received ${daysAvailable}`,
    );
  }

  const ordered = orderByStudyPriority(questions, requirements);
  if (ordered.length === 0) {
    return { days_available: daysAvailable, days: emptyDays(daysAvailable) };
  }

  const studyDayCount = countStudyDays(ordered.length, daysAvailable);

  return {
    days_available: daysAvailable,
    days: [
      ...buildStudyDays(ordered, studyDayCount),
      ...buildReviewDays(ordered, daysAvailable - studyDayCount, studyDayCount),
    ],
  };
}
