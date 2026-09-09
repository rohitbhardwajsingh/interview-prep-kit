/**
 * Confidence after answering, low to high. The scale is deliberately short:
 * finer grades invite people to agonise over a 3 versus a 4 when the only
 * decision that matters is whether this needs to come back soon.
 */
export const CONFIDENCE_LEVELS = [1, 2, 3, 4, 5] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

/**
 * Leitner boxes, in days. Box 0 is "got it wrong, show me again today".
 * Growth is roughly doubling, which is the classic spacing and keeps a
 * fortnight's preparation to about five sightings of a hard item.
 */
export const BOX_INTERVALS_DAYS = [0, 1, 2, 4, 7, 14] as const;
export const MAX_BOX = BOX_INTERVALS_DAYS.length - 1;

export interface ReviewState {
  questionId: string;
  box: number;
  /** Day index, counted from day 1 of the plan. */
  dueOnDay: number;
  lastConfidence: Confidence | null;
  timesSeen: number;
}

export function initialState(questionId: string): ReviewState {
  return {
    questionId,
    box: 0,
    dueOnDay: 1,
    lastConfidence: null,
    timesSeen: 0,
  };
}

/**
 * A confident answer promotes one box; a shaky one demotes to the start rather
 * than stepping down, because an item you could not answer is not "slightly
 * less known", it is unlearned and needs the full ladder again.
 */
export function nextBox(box: number, confidence: Confidence): number {
  if (confidence <= 2) return 0;
  if (confidence === 3) return box;
  return Math.min(box + 1, MAX_BOX);
}

export interface ReviewOptions {
  /** Day the answer was given, counted from day 1. */
  today: number;
  /** Total days in the plan; nothing is scheduled past the interview. */
  daysAvailable: number;
}

export function review(
  state: ReviewState,
  confidence: Confidence,
  options: ReviewOptions,
): ReviewState {
  const box = nextBox(state.box, confidence);
  const interval = BOX_INTERVALS_DAYS[box] ?? 0;

  return {
    ...state,
    box,
    // Clamped to the last day: an item due after the interview is useless, and
    // a weak item is better seen once more than never again.
    dueOnDay: Math.min(options.today + interval, options.daysAvailable),
    lastConfidence: confidence,
    timesSeen: state.timesSeen + 1,
  };
}

export interface QueueItem {
  questionId: string;
  state: ReviewState;
}

/**
 * What to practise now. Due items first, weakest and least-seen ahead of the
 * rest, then anything never attempted. Ordering is total and derived only from
 * the states passed in, so the same inputs always produce the same queue.
 */
export function buildQueue(
  states: readonly ReviewState[],
  today: number,
): QueueItem[] {
  const due = states.filter((state) => state.dueOnDay <= today);

  const ranked = [...due].sort((a, b) => {
    // Never-seen items lead: an unknown is riskier than a known weakness.
    if (a.timesSeen === 0 !== (b.timesSeen === 0)) {
      return a.timesSeen === 0 ? -1 : 1;
    }
    if (a.box !== b.box) return a.box - b.box;

    const aConfidence = a.lastConfidence ?? 0;
    const bConfidence = b.lastConfidence ?? 0;
    if (aConfidence !== bConfidence) return aConfidence - bConfidence;

    if (a.dueOnDay !== b.dueOnDay) return a.dueOnDay - b.dueOnDay;
    // Falls back to the id so the order never depends on input order.
    return a.questionId.localeCompare(b.questionId);
  });

  return ranked.map((state) => ({ questionId: state.questionId, state }));
}

export interface PracticeProgress {
  total: number;
  attempted: number;
  /** Items in the top two boxes, which is as close to "known" as this gets. */
  solid: number;
  shaky: number;
  dueToday: number;
}

export function summarise(
  states: readonly ReviewState[],
  today: number,
): PracticeProgress {
  return {
    total: states.length,
    attempted: states.filter((state) => state.timesSeen > 0).length,
    solid: states.filter((state) => state.box >= MAX_BOX - 1).length,
    shaky: states.filter(
      (state) => state.timesSeen > 0 && state.box <= 1,
    ).length,
    dueToday: states.filter((state) => state.dueOnDay <= today).length,
  };
}
