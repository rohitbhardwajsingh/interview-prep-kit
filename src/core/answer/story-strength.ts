import { words } from "./text";

/**
 * How well a story would actually survive being told.
 *
 * Evidence Gaps already answers "do you have a story for this requirement".
 * This answers the harder question underneath it: is the story you have any
 * good? A candidate with six weak stories is in more danger than one with
 * three strong ones, because they believe they are prepared.
 *
 * Every check is deterministic and each one names the sentence that failed
 * it, so the verdict is arguable rather than oracular.
 */

export interface StoryInput {
  id: string;
  title: string;
  situation: string;
  action: string;
  result: string;
}

export const STORY_CHECKS = [
  "ownership",
  "measurable",
  "specific",
  "complete",
] as const;
export type StoryCheckId = (typeof STORY_CHECKS)[number];

export interface StoryCheck {
  id: StoryCheckId;
  passed: boolean;
  label: string;
  detail: string;
}

export interface StoryStrength {
  storyId: string;
  /** 0 to 100. */
  score: number;
  checks: StoryCheck[];
  /** The single most valuable thing to change about this story. */
  fix: string | null;
  /**
   * Share of first-person verbs against team-attributed ones in the action.
   * Null when the action names no agent at all.
   */
  ownership: number | null;
}

const FIRST_PERSON = /(?<![a-z0-9])(i|i'd|i've|i'm|my|me)(?![a-z0-9])/gi;
const COLLECTIVE = /(?<![a-z0-9])(we|we'd|we've|our|us|the team|they)(?![a-z0-9])/gi;

/** A result with no number in it is an opinion about a result. */
const FIGURE =
  /\b\d+(?:[.,]\d+)?\s*(?:%|percent|x|ms|s|seconds?|minutes?|hours?|days?|weeks?|months?|years?|k|m|bn|million|billion|gb|tb|rps|qps)?\b/i;

function count(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}

/**
 * The single most common weakness in an interview answer, and the easiest
 * to fix once someone can see it: a story told entirely in "we", which
 * tells the interviewer what the team did and nothing about the candidate.
 */
function checkOwnership(story: StoryInput): {
  check: StoryCheck;
  ratio: number | null;
} {
  const mine = count(story.action, FIRST_PERSON);
  const ours = count(story.action, COLLECTIVE);
  const total = mine + ours;
  const ratio = total === 0 ? null : mine / total;

  // Half is a low bar deliberately: collaborative work is real, and the
  // failure being caught is the story with no "I" in it at all.
  const passed = ratio !== null && ratio >= 0.5;

  return {
    ratio,
    check: {
      id: "ownership",
      passed,
      label: "Says what you did",
      detail:
        ratio === null
          ? "The action never names who did anything."
          : passed
            ? "Your own contribution is clear."
            : `Told mostly as “we” (${ours} against ${mine} first-person). An interviewer cannot tell what you did.`,
    },
  };
}

function checkMeasurable(story: StoryInput): StoryCheck {
  const passed = FIGURE.test(story.result);
  return {
    id: "measurable",
    passed,
    label: "Has a measurable result",
    detail: passed
      ? "The outcome carries a figure."
      : "No number in the result. “It went much better” is a claim; “from 8s to 120ms” is evidence.",
  };
}

function checkSpecific(story: StoryInput): StoryCheck {
  const body = `${story.situation} ${story.action}`;
  // Capitalised words after the first, which in practice are the named
  // systems, teams and products that make a story sound lived rather than
  // constructed.
  const named = body
    .split(/\s+/)
    .slice(1)
    .filter((token) => /^[A-Z][A-Za-z0-9.+#-]{2,}$/.test(token.replace(/[^A-Za-z0-9.+#-]/g, "")));

  const passed = named.length > 0 || FIGURE.test(body);
  return {
    id: "specific",
    passed,
    label: "Names real things",
    detail: passed
      ? "Names specific systems or figures."
      : "Nothing named or numbered. Generic stories are indistinguishable from invented ones.",
  };
}

/** Long enough to be worth telling, in every part. */
function checkComplete(story: StoryInput): StoryCheck {
  const thin = (["situation", "action", "result"] as const).filter(
    (part) => words(story[part]).length < 8,
  );

  return {
    id: "complete",
    passed: thin.length === 0,
    label: "Is actually finished",
    detail:
      thin.length === 0
        ? "Situation, action and result are all filled in."
        : `Too thin to tell: ${thin.join(", ")}.`,
  };
}

const WEIGHTS: Readonly<Record<StoryCheckId, number>> = {
  ownership: 0.35,
  measurable: 0.3,
  specific: 0.2,
  complete: 0.15,
};

/** In the order worth fixing: the biggest gain first. */
const FIX_ORDER: readonly StoryCheckId[] = [
  "complete",
  "ownership",
  "measurable",
  "specific",
];

const FIXES: Readonly<Record<StoryCheckId, string>> = {
  complete: "Finish it — a story missing its result cannot be told.",
  ownership: "Rewrite the action in the first person. What did *you* decide?",
  measurable: "Put a number on the outcome, even a rough one.",
  specific: "Name the system, the team or the scale.",
};

export function scoreStory(story: StoryInput): StoryStrength {
  const owned = checkOwnership(story);
  const checks: StoryCheck[] = [
    owned.check,
    checkMeasurable(story),
    checkSpecific(story),
    checkComplete(story),
  ];

  const score = Math.round(
    checks.reduce(
      (sum, check) => sum + (check.passed ? WEIGHTS[check.id] : 0),
      0,
    ) * 100,
  );

  const worst = FIX_ORDER.find(
    (id) => !checks.find((check) => check.id === id)?.passed,
  );

  return {
    storyId: story.id,
    score,
    checks,
    fix: worst ? FIXES[worst] : null,
    ownership: owned.ratio,
  };
}

export function scoreStories(
  stories: readonly StoryInput[],
): StoryStrength[] {
  return stories.map(scoreStory);
}
