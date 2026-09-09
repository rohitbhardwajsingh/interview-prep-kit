import type { KitQuestion, KitRequirement } from "../kit/schema";

export const MINUTES_BY_DIFFICULTY: Readonly<Record<number, number>> = {
  1: 10,
  2: 15,
  3: 25,
};

export const FALLBACK_QUESTION_MINUTES = 15;
export const REVIEW_MINUTES_FACTOR = 0.6;
export const MIN_DAY_MINUTES = 15;
export const MAX_QUESTIONS_PER_STUDY_DAY = 8;

export function questionMinutes(question: KitQuestion): number {
  return MINUTES_BY_DIFFICULTY[question.difficulty] ?? FALLBACK_QUESTION_MINUTES;
}

function totalMinutes(questions: readonly KitQuestion[]): number {
  return questions.reduce((sum, question) => sum + questionMinutes(question), 0);
}

export function studyMinutes(questions: readonly KitQuestion[]): number {
  return Math.max(MIN_DAY_MINUTES, totalMinutes(questions));
}

export function reviewMinutes(questions: readonly KitQuestion[]): number {
  return Math.max(
    MIN_DAY_MINUTES,
    Math.round(totalMinutes(questions) * REVIEW_MINUTES_FACTOR),
  );
}

/**
 * Study order for the whole kit: anything answering a must-have requirement
 * first, hardest first within that, original order as the tie-break so the
 * result is stable across runs.
 */
export function orderByStudyPriority(
  questions: readonly KitQuestion[],
  requirements: readonly KitRequirement[],
): KitQuestion[] {
  const mustIds = new Set(
    requirements
      .filter((requirement) => requirement.priority === "must")
      .map((requirement) => requirement.id),
  );

  return questions
    .map((question, index) => ({
      question,
      index,
      coversMust: question.requirement_ids.some((id) => mustIds.has(id)),
    }))
    .sort((left, right) => {
      if (left.coversMust !== right.coversMust) return left.coversMust ? -1 : 1;
      if (left.question.difficulty !== right.question.difficulty) {
        return right.question.difficulty - left.question.difficulty;
      }
      return left.index - right.index;
    })
    .map((entry) => entry.question);
}
