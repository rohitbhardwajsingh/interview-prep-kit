import type { KitQuestion, KitRequirement } from "../kit/schema";

/**
 * Choosing what to work on next, under a budget.
 *
 * Two callers, one judgement. A candidate with ten minutes and one with a
 * mock interview to sit are asking the same question — which of these forty
 * questions matter most right now — and answering it twice would guarantee
 * the two answers disagreed.
 *
 * The ranking is deterministic and the reason for each choice is returned
 * with it. That matters more than the ranking being optimal: a candidate who
 * is told "this one, because you have never answered it and it is the only
 * thing covering a must-have" will do it, and one handed an unexplained list
 * will reorder it themselves.
 */

/** What a question costs to work on, in minutes. */
const COST = {
  /** Reading an outline and grading yourself against it. */
  review: 2,
  /** Answering out loud, then reading the scorecard. */
  answer: 4,
} as const;

export interface QuestionState {
  questionId: string;
  /** Leitner box, 0 when never attempted. */
  box: number;
  timesSeen: number;
  /** Best measured score across attempts, null when never answered aloud. */
  bestScore: number | null;
  /** Gap between the last prediction and its measurement, when there is one. */
  predictionGap: number | null;
}

export interface TriageInput {
  questions: readonly KitQuestion[];
  requirements: readonly KitRequirement[];
  states: readonly QuestionState[];
  /** Requirement ids with no story behind them, which raises their questions. */
  unevidencedRequirementIds?: readonly string[];
  minutes: number;
}

export type ActionKind = "answer" | "review";

export interface TriageAction {
  questionId: string;
  prompt: string;
  category: string;
  kind: ActionKind;
  minutes: number;
  /** Why this one, in the words the user reads. */
  reason: string;
  /** Higher is more urgent. Exposed so callers can explain their ordering. */
  weight: number;
}

export interface TriageResult {
  actions: TriageAction[];
  minutesUsed: number;
  /** How many questions were left out for want of time. */
  deferred: number;
  summary: string;
}

interface Scored {
  question: KitQuestion;
  state: QuestionState;
  weight: number;
  reason: string;
  kind: ActionKind;
}

/**
 * Urgency, worst first.
 *
 * The order of these branches is the product's opinion about preparation. A
 * blind spot beats an unanswered question, because not knowing you cannot
 * answer something is worse than knowing it. An untouched must-have beats a
 * weak nice-to-have, because the interview is built from the must-haves. And
 * a question already answered well is worth almost nothing, however long ago
 * — re-drilling what you know is how people feel productive without getting
 * any readier.
 */
function scoreQuestion(
  question: KitQuestion,
  state: QuestionState,
  musts: ReadonlySet<string>,
  unevidenced: ReadonlySet<string>,
): Scored {
  const isMust = question.requirement_ids.some((id) => musts.has(id));
  const isUnevidenced = question.requirement_ids.some((id) =>
    unevidenced.has(id),
  );

  // Rated well above what the answer contained: the candidate does not know
  // this is a problem, so nothing else will bring them back to it.
  if (state.predictionGap !== null && state.predictionGap >= 15) {
    return {
      question,
      state,
      weight: 100 + state.predictionGap,
      reason: `You rated this well above what the answer covered. ${
        isMust ? "It is a must-have." : "Worth another go."
      }`,
      kind: "answer",
    };
  }

  if (state.bestScore !== null && state.bestScore < 40) {
    return {
      question,
      state,
      weight: 90 + (40 - state.bestScore),
      reason: "This fell over the last time you answered it out loud.",
      kind: "answer",
    };
  }

  if (state.timesSeen === 0 && isMust) {
    return {
      question,
      state,
      weight: 80,
      reason: isUnevidenced
        ? "Never attempted, covers a must-have, and you have no story for it."
        : "Never attempted, and it covers a must-have.",
      kind: "answer",
    };
  }

  if (state.bestScore === null && isMust) {
    return {
      question,
      state,
      weight: 60,
      reason: "Reviewed but never said out loud, and it is a must-have.",
      kind: "answer",
    };
  }

  if (state.timesSeen === 0) {
    return {
      question,
      state,
      weight: 45,
      reason: "Never attempted.",
      kind: "answer",
    };
  }

  // Weak in the spacing sense: seen, but has not survived a gap.
  if (state.box <= 1) {
    return {
      question,
      state,
      weight: 35,
      reason: "Went badly enough last time that it reset to the start.",
      kind: "review",
    };
  }

  if (state.bestScore === null) {
    return {
      question,
      state,
      weight: 20,
      reason: "Reviewed, but you have never actually said it.",
      kind: "answer",
    };
  }

  return {
    question,
    state,
    weight: Math.max(1, 15 - state.box * 2),
    reason: "Solid already; this is upkeep.",
    kind: "review",
  };
}

/** What ranking actually needs, which is everything except the budget. */
type Rankable = Omit<TriageInput, "minutes">;

function rank(input: Rankable): Scored[] {
  const musts = new Set(
    input.requirements
      .filter((requirement) => requirement.priority === "must")
      .map((requirement) => requirement.id),
  );
  const unevidenced = new Set(input.unevidencedRequirementIds ?? []);

  const byId = new Map(input.states.map((state) => [state.questionId, state]));

  return input.questions
    .map((question) =>
      scoreQuestion(
        question,
        byId.get(question.id) ?? {
          questionId: question.id,
          box: 0,
          timesSeen: 0,
          bestScore: null,
          predictionGap: null,
        },
        musts,
        unevidenced,
      ),
    )
    .sort((left, right) => {
      if (right.weight !== left.weight) return right.weight - left.weight;
      // Harder questions first at equal weight: they are the ones a candidate
      // avoids, and the tie-break has to be stable anyway.
      if (right.question.difficulty !== left.question.difficulty) {
        return right.question.difficulty - left.question.difficulty;
      }
      return left.question.id.localeCompare(right.question.id);
    });
}

/**
 * The most useful things that fit in the time available.
 *
 * Fills greedily by urgency rather than packing the budget perfectly. A
 * candidate with ten minutes wants the two things that matter, not four
 * cheap ones that happen to add up — and an optimal knapsack that quietly
 * swapped the top item for two lesser ones would be actively worse advice.
 */
export function triage(input: TriageInput): TriageResult {
  const ranked = rank(input);

  const actions: TriageAction[] = [];
  let used = 0;

  for (const scored of ranked) {
    const minutes = COST[scored.kind];
    if (used + minutes > input.minutes) continue;

    actions.push({
      questionId: scored.question.id,
      prompt: scored.question.prompt,
      category: scored.question.category,
      kind: scored.kind,
      minutes,
      reason: scored.reason,
      weight: scored.weight,
    });
    used += minutes;
  }

  return {
    actions,
    minutesUsed: used,
    deferred: ranked.length - actions.length,
    summary: summaryFor(input.minutes, actions, ranked.length),
  };
}

function summaryFor(
  budget: number,
  actions: readonly TriageAction[],
  total: number,
): string {
  if (total === 0) return "This kit has no questions yet.";
  if (actions.length === 0) {
    return `${budget} minutes is not quite enough for anything here. Two minutes would get you one outline review.`;
  }

  const answering = actions.filter((action) => action.kind === "answer").length;
  const reviewing = actions.length - answering;

  const parts: string[] = [];
  if (answering > 0) {
    parts.push(`answer ${answering} out loud`);
  }
  if (reviewing > 0) {
    parts.push(`review ${reviewing}`);
  }

  return `In ${budget} minutes: ${parts.join(" and ")}. These are the ones that move the needle furthest.`;
}

export interface MockSetInput {
  questions: readonly KitQuestion[];
  requirements: readonly KitRequirement[];
  states: readonly QuestionState[];
  /** How many questions the interview should contain. */
  count: number;
}

/**
 * A representative interview rather than a hardest-first drill.
 *
 * Real panels open easy, spread across categories, and get harder. A set
 * chosen purely by urgency would be five behavioural questions about the
 * candidate's weakest area, which is a useful exercise and a useless
 * rehearsal: the thing being practised here is holding it together across a
 * varied half hour, and that needs the shape of a real one.
 */
export function mockSet(input: MockSetInput): KitQuestion[] {
  const ranked = rank(input);

  const byCategory = new Map<string, Scored[]>();
  for (const scored of ranked) {
    const bucket = byCategory.get(scored.question.category) ?? [];
    bucket.push(scored);
    byCategory.set(scored.question.category, bucket);
  }

  // Round-robin across categories, so a kit dominated by one category does
  // not produce an interview that only tests it.
  const chosen: Scored[] = [];
  const categories = [...byCategory.keys()];
  let exhausted = false;

  while (chosen.length < input.count && !exhausted) {
    exhausted = true;
    for (const category of categories) {
      if (chosen.length >= input.count) break;
      const next = byCategory.get(category)?.shift();
      if (next) {
        chosen.push(next);
        exhausted = false;
      }
    }
  }

  // Easiest first: an interview that opens with its hardest question is not
  // testing preparation, it is testing composure at the worst moment.
  return chosen
    .sort((left, right) => left.question.difficulty - right.question.difficulty)
    .map((scored) => scored.question);
}
