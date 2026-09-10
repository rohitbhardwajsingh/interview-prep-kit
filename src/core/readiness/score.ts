import type { KitQuestion, KitRequirement } from "../kit/schema";
import { MAX_BOX, type ReviewState } from "../practice/leitner";

/**
 * How ready someone actually is, as a number they can act on.
 *
 * Two rules govern everything here. It is **honest**: nothing is rounded up
 * to be encouraging, and an untouched kit scores zero however well it was
 * generated. And it is **explainable**: the number always decomposes into
 * named parts with their own sentences, because a score you cannot argue
 * with is a score you cannot act on.
 */

/**
 * Only work the user actually did earns a score. Coverage is deliberately not
 * here: it is the generator's doing, and letting a well-built kit contribute
 * points would mean opening the app and closing it again scored twenty per
 * cent. It caps the result instead.
 */
export const READINESS_COMPONENTS = ["practice", "evidence"] as const;
export type ReadinessComponentId = (typeof READINESS_COMPONENTS)[number];

const WEIGHTS: Readonly<Record<ReadinessComponentId, number>> = {
  practice: 0.65,
  evidence: 0.35,
};

export const READINESS_BANDS = [
  "not-started",
  "early",
  "getting-there",
  "ready",
] as const;
export type ReadinessBand = (typeof READINESS_BANDS)[number];

export interface ReadinessComponent {
  id: ReadinessComponentId;
  label: string;
  /** 0 to 1. */
  score: number;
  /** Share of the final number, after any absent component is redistributed. */
  weight: number;
  detail: string;
}

export interface ReadinessCeiling {
  /** 0 to 1. Below one, the score cannot reach a hundred. */
  score: number;
  detail: string;
}

export interface Readiness {
  /** 0 to 100, rounded once at the end. */
  score: number;
  band: ReadinessBand;
  components: ReadinessComponent[];
  /**
   * You cannot be ready for a requirement nothing asks you about, so missing
   * coverage limits the score rather than contributing to it.
   */
  ceiling: ReadinessCeiling;
  /** The single highest-leverage thing to do next. */
  nextAction: string;
  /** Things that will hurt in the room, worst first. */
  blockers: string[];
}

export interface ReadinessInput {
  requirements: readonly KitRequirement[];
  questions: readonly KitQuestion[];
  /** Practice state per question. Absent questions count as never seen. */
  reviews: readonly ReviewState[];
  /**
   * Requirements the candidate has a story for. Omitted entirely when the
   * story bank has not been used, which removes evidence from the score
   * rather than scoring it zero and calling everyone unprepared.
   */
  evidencedRequirementIds?: readonly string[];
}

function ratio(part: number, whole: number): number {
  return whole === 0 ? 1 : part / whole;
}

function mustHaves(
  requirements: readonly KitRequirement[],
): KitRequirement[] {
  return requirements.filter(
    (requirement) => requirement.priority === "must",
  );
}

function bandFor(score: number): ReadinessBand {
  if (score < 10) return "not-started";
  if (score < 45) return "early";
  if (score < 80) return "getting-there";
  return "ready";
}

/**
 * How well drilled the questions are, using the Leitner box as the measure of
 * durability: a question answered confidently once is not as safe as one that
 * has survived four spaced sightings, and the score says so.
 */
function practiceScore(
  questions: readonly KitQuestion[],
  reviews: readonly ReviewState[],
): { score: number; unseen: number; shaky: number } {
  if (questions.length === 0) return { score: 0, unseen: 0, shaky: 0 };

  const byId = new Map(reviews.map((state) => [state.questionId, state]));
  let total = 0;
  let unseen = 0;
  let shaky = 0;

  for (const question of questions) {
    const state = byId.get(question.id);
    if (!state || state.timesSeen === 0) {
      unseen += 1;
      continue;
    }
    if (state.box === 0) shaky += 1;
    total += state.box / MAX_BOX;
  }

  return { score: total / questions.length, unseen, shaky };
}

function coverageScore(
  requirements: readonly KitRequirement[],
  questions: readonly KitQuestion[],
): { score: number; uncovered: KitRequirement[] } {
  const must = mustHaves(requirements);
  const asked = new Set(
    questions.flatMap((question) => question.requirement_ids),
  );
  const uncovered = must.filter((requirement) => !asked.has(requirement.id));

  return { score: ratio(must.length - uncovered.length, must.length), uncovered };
}

function evidenceScore(
  requirements: readonly KitRequirement[],
  evidenced: readonly string[],
): { score: number; missing: KitRequirement[] } {
  const must = mustHaves(requirements);
  const have = new Set(evidenced);
  const missing = must.filter((requirement) => !have.has(requirement.id));

  return { score: ratio(must.length - missing.length, must.length), missing };
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function scoreReadiness(input: ReadinessInput): Readiness {
  const practice = practiceScore(input.questions, input.reviews);
  const coverage = coverageScore(input.requirements, input.questions);
  const tracksEvidence = input.evidencedRequirementIds !== undefined;
  const evidence = evidenceScore(
    input.requirements,
    input.evidencedRequirementIds ?? [],
  );

  const active: ReadinessComponentId[] = tracksEvidence
    ? ["practice", "evidence"]
    : ["practice"];

  // The absent component's weight is shared out rather than counted as zero,
  // so declining to use the story bank cannot make you look unprepared.
  const totalWeight = active.reduce((sum, id) => sum + WEIGHTS[id], 0);
  const raw: Record<ReadinessComponentId, number> = {
    practice: practice.score,
    evidence: evidence.score,
  };

  const components: ReadinessComponent[] = active.map((id) => ({
    id,
    label: id === "practice" ? "Practised" : "Evidenced",
    score: raw[id],
    weight: WEIGHTS[id] / totalWeight,
    detail:
      id === "practice"
        ? practice.unseen > 0
          ? `${plural(practice.unseen, "question")} you have never answered`
          : practice.shaky > 0
            ? `${plural(practice.shaky, "question")} still coming back wrong`
            : "Every question has survived spaced review"
        : evidence.missing.length > 0
          ? `${plural(evidence.missing.length, "must-have")} with no story behind it`
          : "Every must-have has a story you can tell",
  }));

  const ceiling: ReadinessCeiling = {
    score: coverage.score,
    detail:
      coverage.uncovered.length > 0
        ? `Capped: ${plural(coverage.uncovered.length, "must-have")} the kit never asks about`
        : "Every must-have is asked about",
  };

  const earned = components.reduce(
    (sum, component) => sum + component.score * component.weight,
    0,
  );
  const score = Math.round(earned * ceiling.score * 100);

  // Worst first, so the interface can show the top one and mean it.
  const blockers: string[] = [];
  if (coverage.uncovered.length > 0) {
    blockers.push(
      `The kit has no question for ${plural(coverage.uncovered.length, "must-have requirement")}`,
    );
  }
  if (practice.unseen > 0) {
    blockers.push(`${plural(practice.unseen, "question")} never attempted`);
  }
  if (practice.shaky > 0) {
    blockers.push(`${plural(practice.shaky, "question")} you keep getting wrong`);
  }
  if (tracksEvidence && evidence.missing.length > 0) {
    blockers.push(
      `${plural(evidence.missing.length, "must-have")} you have no story for`,
    );
  }

  return {
    score,
    band: bandFor(score),
    components,
    ceiling,
    nextAction: nextActionFor({ practice, evidence, tracksEvidence, score }),
    blockers,
  };
}

function nextActionFor({
  practice,
  evidence,
  tracksEvidence,
  score,
}: {
  practice: { unseen: number; shaky: number };
  evidence: { missing: KitRequirement[] };
  tracksEvidence: boolean;
  score: number;
}): string {
  if (practice.unseen > 0) {
    return `Answer ${plural(Math.min(practice.unseen, 3), "question")} you have never tried`;
  }
  if (practice.shaky > 0) {
    return `Go again at ${plural(practice.shaky, "question")} that keeps slipping`;
  }
  if (tracksEvidence && evidence.missing.length > 0) {
    const first = evidence.missing[0];
    return `Write a story for "${first?.text ?? "the requirement with no evidence"}"`;
  }
  if (score >= 80) return "You are ready. Rest, and reread the plan in the morning.";
  return "Keep the spaced review going until the boxes empty";
}
