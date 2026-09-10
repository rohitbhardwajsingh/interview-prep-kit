import { CONFIDENCE_LEVELS } from "../practice/leitner";

/**
 * How well a candidate's self-assessment tracks their measured performance.
 *
 * This is the feature the rest of the product was missing a spine for.
 * Practice already asked "how did that feel?", and readiness already counted
 * how much had been practised, but nothing ever checked the two against each
 * other. The candidate who fails an interview they expected to pass is almost
 * never the one who knew they were unprepared — it is the one who rated
 * themselves confident on the answers they could not actually give.
 *
 * A blind spot here is worth more than a low score: a low score you already
 * know about is just a to-do item.
 */

/**
 * What each self-rating claims, on the measured 0-100 scale.
 *
 * Anchored to the Leitner confidence scale the practice queue already uses,
 * so a user is not asked to learn a second meaning for the number 4. The
 * bands are deliberately generous — 5 claims 90, not 100 — because the point
 * is to catch a real gap, not to punish ordinary optimism.
 */
export const CLAIMED_SCORE: Readonly<Record<number, number>> = {
  1: 10,
  2: 30,
  3: 50,
  4: 70,
  5: 90,
};

/**
 * Under this, a gap is noise. Someone who rates themselves 4 and scores 62 is
 * not miscalibrated; they are a person estimating a number.
 */
export const MEANINGFUL_GAP = 15;

/** Fewer attempts than this and a trend is a coincidence. */
export const MIN_ATTEMPTS_FOR_VERDICT = 3;

/**
 * A blind spot needs the answer to be genuinely weak, not merely overrated.
 *
 * Rating yourself 5 on an answer that scored 70 is a 20-point gap and no
 * cause for alarm: the answer would land. Listing it would bury the questions
 * that actually fall over under ones that are already fine, and a list of
 * things to fix is only useful if everything on it needs fixing.
 */
export const WOULD_NOT_LAND = 60;

export const CALIBRATION_VERDICTS = [
  "overconfident",
  "calibrated",
  "underconfident",
  "unknown",
] as const;

export type CalibrationVerdict = (typeof CALIBRATION_VERDICTS)[number];

export interface ScoredAttempt {
  questionId: string;
  /** The prompt, so a blind spot can be named rather than referenced by id. */
  prompt: string;
  category: string;
  /** What the candidate said it felt like, before seeing any score. */
  selfRating: number;
  /** What the measurement found. */
  measuredScore: number;
}

export interface BlindSpot {
  questionId: string;
  prompt: string;
  category: string;
  selfRating: number;
  measuredScore: number;
  /** Positive when the answer was worse than it felt. */
  gap: number;
}

export interface CategoryCalibration {
  category: string;
  attempts: number;
  /** Positive means answers here are worse than they feel. */
  averageGap: number;
}

export interface Calibration {
  attempts: number;
  verdict: CalibrationVerdict;
  /** Positive means the candidate consistently overrates themselves. */
  averageGap: number;
  averageClaimed: number;
  averageMeasured: number;
  /** Worst gap first: the answers most likely to be walked into cold. */
  blindSpots: BlindSpot[];
  byCategory: CategoryCalibration[];
  /** One sentence, in the words the user will read. */
  summary: string;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number): number {
  return Math.round(value);
}

function clampRating(rating: number): number {
  const levels = CONFIDENCE_LEVELS as readonly number[];
  const lowest = Math.min(...levels);
  const highest = Math.max(...levels);
  return Math.min(highest, Math.max(lowest, Math.round(rating)));
}

/**
 * Only the most recent attempt at a question counts.
 *
 * Practising the same question five times would otherwise let one early
 * fumble dominate a candidate's calibration for good, which is both unfair
 * and useless: the question is whether they can answer it *now*.
 */
function latestPerQuestion(
  attempts: readonly ScoredAttempt[],
): ScoredAttempt[] {
  const latest = new Map<string, ScoredAttempt>();
  for (const attempt of attempts) latest.set(attempt.questionId, attempt);
  return [...latest.values()];
}

function verdictOf(attempts: number, averageGap: number): CalibrationVerdict {
  if (attempts < MIN_ATTEMPTS_FOR_VERDICT) return "unknown";
  if (averageGap > MEANINGFUL_GAP) return "overconfident";
  if (averageGap < -MEANINGFUL_GAP) return "underconfident";
  return "calibrated";
}

/**
 * `attempts` is expected in chronological order; the last attempt at a given
 * question is the one that counts.
 */
export function calibrate(attempts: readonly ScoredAttempt[]): Calibration {
  const counted = latestPerQuestion(attempts);

  const claimed = counted.map((attempt) => CLAIMED_SCORE[clampRating(attempt.selfRating)] ?? 50);
  const measured = counted.map((attempt) => attempt.measuredScore);
  const gaps = counted.map(
    (attempt, index) => (claimed[index] ?? 50) - (measured[index] ?? 0),
  );

  const averageGap = round(mean(gaps));
  const verdict = verdictOf(counted.length, averageGap);

  const blindSpots: BlindSpot[] = counted
    .map((attempt, index) => ({
      questionId: attempt.questionId,
      prompt: attempt.prompt,
      category: attempt.category,
      selfRating: attempt.selfRating,
      measuredScore: attempt.measuredScore,
      gap: gaps[index] ?? 0,
    }))
    .filter(
      (spot) => spot.gap >= MEANINGFUL_GAP && spot.measuredScore < WOULD_NOT_LAND,
    )
    .sort((left, right) => right.gap - left.gap);

  const categories = [...new Set(counted.map((attempt) => attempt.category))];
  const byCategory = categories
    .map((category) => {
      const indices = counted
        .map((attempt, index) => ({ attempt, index }))
        .filter((entry) => entry.attempt.category === category);

      return {
        category,
        attempts: indices.length,
        averageGap: round(mean(indices.map((entry) => gaps[entry.index] ?? 0))),
      };
    })
    .sort((left, right) => right.averageGap - left.averageGap);

  return {
    attempts: counted.length,
    verdict,
    averageGap,
    averageClaimed: round(mean(claimed)),
    averageMeasured: round(mean(measured)),
    blindSpots,
    byCategory,
    summary: summaryFor({ verdict, averageGap, counted, blindSpots, byCategory }),
  };
}

function summaryFor({
  verdict,
  averageGap,
  counted,
  blindSpots,
  byCategory,
}: {
  verdict: CalibrationVerdict;
  averageGap: number;
  counted: readonly ScoredAttempt[];
  blindSpots: readonly BlindSpot[];
  byCategory: readonly CategoryCalibration[];
}): string {
  if (counted.length === 0) {
    return "Answer a few questions out loud and this will tell you whether your instincts about them are right.";
  }

  if (verdict === "unknown") {
    const remaining = MIN_ATTEMPTS_FOR_VERDICT - counted.length;
    return `${remaining} more answered question${remaining === 1 ? "" : "s"} before this means anything.`;
  }

  if (verdict === "overconfident") {
    const worst = byCategory[0];
    const where =
      worst && worst.averageGap >= MEANINGFUL_GAP && byCategory.length > 1
        ? ` Worst on ${worst.category} questions.`
        : "";

    return `Your answers are coming out about ${averageGap} points weaker than they feel${blindSpots.length > 0 ? `, on ${blindSpots.length} question${blindSpots.length === 1 ? "" : "s"} so far` : ""}.${where} These are the ones you would walk into cold.`;
  }

  if (verdict === "underconfident") {
    return `You are answering about ${Math.abs(averageGap)} points better than you think. The preparation is further along than the feeling.`;
  }

  return "Your sense of how an answer went is tracking what you actually said. Trust it.";
}
