import type { KitQuestion } from "../kit/schema";
import { contentWords, mentions, sentences, words } from "./text";

/**
 * What a spoken answer actually contained, measured rather than judged.
 *
 * This exists because the rest of the system was resting on self-assessment,
 * which is the one thing an anxious candidate is reliably bad at. Everything
 * here is deterministic and explainable: it can say "you never said anything
 * about indexes" and point at the outline line it means.
 *
 * It deliberately does not try to decide whether an answer is *good*. That
 * is a judgement, it needs a model, and it lives elsewhere. This measures.
 */

/** Spoken padding. Counted, not banned: a few are human, a lot is a tell. */
const FILLERS = [
  "um", "uh", "erm", "ah", "like", "basically", "actually", "literally",
  "honestly", "obviously", "essentially", "right",
];

/** Language that withdraws a claim as it is being made. */
const HEDGES = [
  "i think", "i guess", "i suppose", "maybe", "probably", "sort of",
  "kind of", "i'm not sure", "im not sure", "or something", "i would say",
  "possibly", "perhaps",
];

const RESULT_CUES = [
  "result", "reduced", "increased", "improved", "cut", "saved", "grew",
  "dropped", "went from", "went out", "ended up", "impact", "outcome",
  "shipped", "delivered", "fixed", "resolved", "so that", "instead of",
];

const SITUATION_CUES = [
  "we were", "i was", "the team", "at the time", "context", "the problem",
  "we had", "i had", "they wanted", "the issue", "when i", "back when",
];

/**
 * First person, which is the whole point: an answer where everything was
 * done by "the team" tells an interviewer nothing about the candidate.
 */
const ACTION_CUES = [
  "i", "i'd", "i've", "my approach", "i decided", "i built", "i wrote",
  "i changed", "i led", "i proposed", "i ran", "i added",
];

/**
 * Words a minute people actually speak under pressure. Below this an answer
 * is halting; above it they are racing and will not be followed.
 */
export const COMFORTABLE_WPM = { low: 110, high: 175 } as const;

/**
 * How long a strong answer runs, by category, in seconds.
 *
 * Also sent to the client with the practice queue, so the live clock during
 * an answer is measured against the same window the analysis will use.
 */
export const TARGET_SECONDS: Readonly<Record<string, [number, number]>> = {
  behavioural: [75, 150],
  technical: [60, 150],
  "system-design": [120, 300],
  "company-fit": [45, 105],
};

const DEFAULT_TARGET: [number, number] = [60, 150];

export interface OutlinePoint {
  /** The outline line, as written. */
  text: string;
  covered: boolean;
  /** The words that decided it, so the verdict can be shown and argued with. */
  matched: string[];
}

export interface StarCheck {
  situation: boolean;
  action: boolean;
  result: boolean;
  /** Only meaningful for behavioural questions. */
  applies: boolean;
}

export interface Pacing {
  wordCount: number;
  spokenSeconds: number | null;
  wordsPerMinute: number | null;
  targetSeconds: [number, number];
  verdict: "too-short" | "good" | "too-long" | "unknown";
  /** Seconds before the first concrete detail appeared. */
  secondsToFirstSpecific: number | null;
}

export interface AnswerAnalysis {
  points: OutlinePoint[];
  /** Fraction of the outline the answer actually reached. */
  coverage: number;
  /** Concrete details found: figures, durations, named things. */
  specifics: string[];
  fillers: { word: string; count: number }[];
  fillerRatePer100: number;
  hedges: string[];
  star: StarCheck;
  pacing: Pacing;
  /** 0 to 100, from the measurements above alone. */
  score: number;
  /** Worst-first, in the words the user will see. */
  notes: string[];
}

export interface AnalyseAnswerInput {
  transcript: string;
  question: Pick<KitQuestion, "answer_outline" | "category">;
  /** Wall-clock length of the answer, when it was spoken rather than typed. */
  spokenSeconds?: number;
}

/**
 * Splits an outline into the points it is actually making.
 *
 * Outlines are written as bullets, and their parentheses hold examples
 * rather than requirements — "monitoring tools (Datadog, Grafana)" is
 * satisfied by naming any one of them, or by saying "monitoring" at all.
 * Treating the examples as required would fail almost every real answer.
 */
function splitOutline(outline: string): { text: string; core: string[]; examples: string[] }[] {
  return outline
    .split(/\n+/)
    .map((line) => line.replace(/^\s*[-*•\d.)\]]+\s*/, "").trim())
    .filter((line) => line.length > 2)
    .map((line) => {
      const examples: string[] = [];
      const core = line.replace(/\(([^)]*)\)/g, (_whole, inner: string) => {
        for (const option of inner.split(/[,/]|\bor\b/)) {
          const cleaned = option.replace(/^\s*e\.?g\.?:?\s*/i, "").trim();
          if (cleaned.length >= 3) examples.push(cleaned);
        }
        return " ";
      });

      return { text: line, core: contentWords(core), examples };
    });
}

function coverPoint(
  point: { text: string; core: string[]; examples: string[] },
  spoken: string[],
  lowered: string,
): OutlinePoint {
  const matched = point.core.filter((term) => mentions(spoken, term));

  // An example naming its own thing is strong evidence on its own.
  const exampleHit = point.examples.find((example) =>
    lowered.includes(example.toLowerCase()),
  );
  if (exampleHit) matched.push(exampleHit);

  // Half the point's substantive words, which in practice separates "said
  // the thing" from "used one word that happened to overlap".
  const needed = Math.max(1, Math.ceil(point.core.length / 2));
  return {
    text: point.text,
    covered: Boolean(exampleHit) || matched.length >= needed,
    matched,
  };
}

/** Figures, durations and named systems: the things that make an answer land. */
function findSpecifics(transcript: string): string[] {
  const found = new Set<string>();

  for (const match of transcript.matchAll(
    /\b\d+(?:[.,]\d+)?\s*(?:%|percent|x|ms|s|seconds?|minutes?|hours?|days?|weeks?|months?|years?|k|m|bn|million|billion|gb|tb|rps|qps|req\/s)?\b/gi,
  )) {
    found.add(match[0].trim());
  }

  // Capitalised words mid-sentence are usually product or system names.
  for (const sentence of sentences(transcript)) {
    const tokens = sentence.split(/\s+/).slice(1);
    for (const token of tokens) {
      const cleaned = token.replace(/[^A-Za-z0-9.+#-]/g, "");
      if (/^[A-Z][A-Za-z0-9.+#-]{2,}$/.test(cleaned)) found.add(cleaned);
    }
  }

  return [...found];
}

function countFillers(spoken: string[]): { word: string; count: number }[] {
  return FILLERS.map((filler) => ({
    word: filler,
    count: spoken.filter((word) => word === filler).length,
  }))
    .filter((entry) => entry.count > 0)
    .sort((left, right) => right.count - left.count);
}

/**
 * Cues match whole words only. A bare substring test looks harmless until
 * "ive" matches inside "delivery" and an answer that never says "I" is
 * credited with describing personal action.
 */
function saysAnyOf(text: string, cues: readonly string[]): boolean {
  return cues.some((cue) => {
    const escaped = cue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "i").test(text);
  });
}

function checkStar(
  lowered: string,
  category: string,
  hasSpecific: boolean,
): StarCheck {
  const has = (cues: readonly string[]) => saysAnyOf(lowered, cues);

  return {
    applies: category === "behavioural",
    situation: has(SITUATION_CUES),
    action: has(ACTION_CUES),
    // A result nobody can measure is a claim, not a result.
    result: has(RESULT_CUES) && hasSpecific,
  };
}

function measurePacing(
  transcript: string,
  wordCount: number,
  category: string,
  spokenSeconds: number | undefined,
): Pacing {
  const targetSeconds = TARGET_SECONDS[category] ?? DEFAULT_TARGET;
  const [low, high] = targetSeconds;

  // Typed answers have no clock, so length is judged against the words a
  // person would have spoken in the target window.
  const seconds = spokenSeconds ?? null;
  const effective = seconds ?? (wordCount / COMFORTABLE_WPM.low) * 60;

  return {
    wordCount,
    spokenSeconds: seconds,
    wordsPerMinute:
      seconds && seconds > 0 ? Math.round((wordCount / seconds) * 60) : null,
    targetSeconds,
    verdict:
      wordCount === 0
        ? "unknown"
        : effective < low * 0.7
          ? "too-short"
          : effective > high
            ? "too-long"
            : "good",
    secondsToFirstSpecific: firstSpecificAt(transcript, wordCount, seconds),
  };
}

/**
 * How long the listener waited for anything concrete. This is the single
 * most diagnostic number for the commonest real failure, which is not
 * ignorance but two minutes of preamble.
 */
function firstSpecificAt(
  transcript: string,
  wordCount: number,
  spokenSeconds: number | null,
): number | null {
  if (!spokenSeconds || wordCount === 0) return null;

  const spoken = words(transcript);
  for (let index = 0; index < spoken.length; index += 1) {
    const upto = spoken.slice(0, index + 1).join(" ");
    if (findSpecifics(upto).length > 0) {
      return Math.round((index / wordCount) * spokenSeconds);
    }
  }
  return null;
}

export function analyseAnswer({
  transcript,
  question,
  spokenSeconds,
}: AnalyseAnswerInput): AnswerAnalysis {
  const trimmed = transcript.trim();
  const spoken = words(trimmed);
  const lowered = trimmed.toLowerCase();
  const wordCount = spoken.length;

  const points = splitOutline(question.answer_outline).map((point) =>
    coverPoint(point, spoken, lowered),
  );
  const coverage =
    points.length === 0
      ? 0
      : points.filter((point) => point.covered).length / points.length;

  const specifics = findSpecifics(trimmed);
  const fillers = countFillers(spoken);
  const fillerCount = fillers.reduce((sum, entry) => sum + entry.count, 0);
  const hedges = HEDGES.filter((hedge) => lowered.includes(hedge));
  const star = checkStar(lowered, question.category, specifics.length > 0);
  const pacing = measurePacing(trimmed, wordCount, question.category, spokenSeconds);

  return {
    points,
    coverage,
    specifics,
    fillers,
    fillerRatePer100:
      wordCount === 0 ? 0 : Math.round((fillerCount / wordCount) * 1000) / 10,
    hedges,
    star,
    pacing,
    score: scoreOf({ coverage, specifics, star, pacing, wordCount, fillerCount }),
    notes: notesFor({ coverage, points, specifics, star, pacing, fillers, hedges }),
  };
}

/**
 * Coverage dominates, because saying the right things is most of the job.
 * Everything else adjusts around it: concrete detail earns, and rambling or
 * padding costs. An empty answer scores nothing rather than scoring well on
 * the things it failed to do badly.
 */
function scoreOf({
  coverage,
  specifics,
  star,
  pacing,
  wordCount,
  fillerCount,
}: {
  coverage: number;
  specifics: string[];
  star: StarCheck;
  pacing: Pacing;
  wordCount: number;
  fillerCount: number;
}): number {
  if (wordCount < 10) return 0;

  let score = coverage * 70;

  // Two concrete details is the point at which an answer stops being
  // generic; more than that is not proportionally better.
  score += Math.min(specifics.length, 2) * 7.5;

  if (star.applies) {
    score += (Number(star.situation) + Number(star.action) + Number(star.result)) * 5;
  } else {
    score += 15;
  }

  if (pacing.verdict === "too-long") score -= 10;
  if (pacing.verdict === "too-short") score -= 15;

  // Roughly one filler in twenty words before it costs anything.
  const fillerRate = fillerCount / wordCount;
  if (fillerRate > 0.05) score -= Math.min(10, (fillerRate - 0.05) * 200);

  return Math.max(0, Math.min(100, Math.round(score)));
}

function notesFor({
  coverage,
  points,
  specifics,
  star,
  pacing,
  fillers,
  hedges,
}: {
  coverage: number;
  points: OutlinePoint[];
  specifics: string[];
  star: StarCheck;
  pacing: Pacing;
  fillers: { word: string; count: number }[];
  hedges: string[];
}): string[] {
  const notes: string[] = [];
  const missed = points.filter((point) => !point.covered);

  if (points.length > 0 && coverage < 1) {
    notes.push(
      `Missed ${missed.length} of ${points.length} points the outline expects.`,
    );
  }
  if (specifics.length === 0) {
    notes.push(
      "Nothing concrete: no figures, durations or named systems. This is what makes an answer sound rehearsed rather than lived.",
    );
  }
  if (star.applies && !star.result) {
    notes.push(
      "No measurable result. A behavioural answer that stops before the outcome is a story without an ending.",
    );
  }
  if (star.applies && !star.action) {
    notes.push("Hard to tell what you personally did, as opposed to the team.");
  }
  if (pacing.verdict === "too-long") {
    notes.push(
      `Long: ${pacing.wordCount} words against a target of about ${pacing.targetSeconds[1]} seconds.`,
    );
  }
  if (pacing.verdict === "too-short") {
    notes.push("Short enough that an interviewer will assume you have no more.");
  }
  if (
    pacing.secondsToFirstSpecific !== null &&
    pacing.secondsToFirstSpecific > 30
  ) {
    notes.push(
      `${pacing.secondsToFirstSpecific} seconds of preamble before the first concrete detail.`,
    );
  }
  const fillerTotal = fillers.reduce((sum, entry) => sum + entry.count, 0);
  if (fillerTotal > 0 && pacing.wordCount > 0 && fillerTotal / pacing.wordCount > 0.05) {
    notes.push(
      `Filler is noticeable: “${fillers[0]?.word}” ${fillers[0]?.count} times.`,
    );
  }
  if (hedges.length >= 2) {
    notes.push(
      `Hedging (${hedges.slice(0, 2).map((hedge) => `“${hedge}”`).join(", ")}) undercuts answers you clearly know.`,
    );
  }

  return notes;
}
