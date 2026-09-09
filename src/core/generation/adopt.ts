import {
  FLASHCARD_ID_PREFIX,
  QUESTION_ID_PREFIX,
  REQUIREMENT_ID_PREFIX,
  createIdMinter,
} from "../kit/ids";
import type { KitFlashcard, KitQuestion, KitRequirement } from "../kit/schema";
import type {
  DraftFlashcard,
  DraftQuestion,
  DraftRequirement,
} from "./schemas";

export interface AdoptionReport {
  /** Items dropped because none of their cited ids exist. */
  droppedForUnknownReference: number;
  /** Individual bad citations removed from items that survived. */
  strippedReferences: number;
  /** Items dropped as a repeat of something already present. */
  droppedAsDuplicate: number;
}

function emptyReport(): AdoptionReport {
  return {
    droppedForUnknownReference: 0,
    strippedReferences: 0,
    droppedAsDuplicate: 0,
  };
}

export function describeAdoption(report: AdoptionReport): string {
  const notes: string[] = [];
  if (report.droppedForUnknownReference > 0) {
    notes.push(`${report.droppedForUnknownReference} cited no known requirement`);
  }
  if (report.strippedReferences > 0) {
    notes.push(`${report.strippedReferences} invented references stripped`);
  }
  if (report.droppedAsDuplicate > 0) {
    notes.push(`${report.droppedAsDuplicate} duplicates dropped`);
  }
  return notes.join(", ");
}

/** Collapses wording differences so a reworded repeat still counts as one. */
function fingerprint(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Keeps only citations that name a real requirement. An unknown reference is a
 * fatal kit error, so it can never be allowed through: the reference is removed
 * and, if nothing valid remains, the whole item goes. Everything removed is
 * counted so the run can report it rather than hide it.
 */
function keepKnownReferences(
  cited: readonly string[],
  known: ReadonlySet<string>,
  report: AdoptionReport,
): string[] | null {
  const kept: string[] = [];
  for (const id of cited) {
    if (known.has(id)) {
      if (!kept.includes(id)) kept.push(id);
    } else {
      report.strippedReferences += 1;
    }
  }

  if (kept.length === 0) {
    report.droppedForUnknownReference += 1;
    // The stripped count would double-report an item that is going anyway.
    report.strippedReferences -= cited.length;
    return null;
  }

  return kept;
}

/** Requirements are the one list with nothing to verify, only ids to assign. */
export function adoptRequirements(
  drafts: readonly DraftRequirement[],
): { requirements: KitRequirement[]; report: AdoptionReport } {
  const report = emptyReport();
  const mint = createIdMinter(REQUIREMENT_ID_PREFIX, []);
  const seen = new Set<string>();
  const requirements: KitRequirement[] = [];

  for (const draft of drafts) {
    const key = fingerprint(draft.text);
    if (key.length === 0) continue;
    if (seen.has(key)) {
      report.droppedAsDuplicate += 1;
      continue;
    }
    seen.add(key);

    requirements.push({
      id: mint(),
      text: draft.text,
      kind: draft.kind,
      priority: draft.priority,
    });
  }

  return { requirements, report };
}

export function adoptQuestions(
  drafts: readonly DraftQuestion[],
  options: {
    knownRequirementIds: readonly string[];
    existingQuestions: readonly KitQuestion[];
  },
): { questions: KitQuestion[]; report: AdoptionReport } {
  const report = emptyReport();
  const known = new Set(options.knownRequirementIds);
  const mint = createIdMinter(
    QUESTION_ID_PREFIX,
    options.existingQuestions.map((question) => question.id),
  );
  const seen = new Set(
    options.existingQuestions.map((question) => fingerprint(question.prompt)),
  );
  const questions: KitQuestion[] = [];

  for (const draft of drafts) {
    const references = keepKnownReferences(draft.requirement_ids, known, report);
    if (!references) continue;

    const key = fingerprint(draft.prompt);
    if (seen.has(key)) {
      report.droppedAsDuplicate += 1;
      continue;
    }
    seen.add(key);

    questions.push({
      id: mint(),
      requirement_ids: references,
      category: draft.category,
      prompt: draft.prompt,
      answer_outline: draft.answer_outline,
      difficulty: draft.difficulty,
    });
  }

  return { questions, report };
}

export function adoptFlashcards(
  drafts: readonly DraftFlashcard[],
  options: { knownRequirementIds: readonly string[] },
): { flashcards: KitFlashcard[]; report: AdoptionReport } {
  const report = emptyReport();
  const known = new Set(options.knownRequirementIds);
  const mint = createIdMinter(FLASHCARD_ID_PREFIX, []);
  const seen = new Set<string>();
  const flashcards: KitFlashcard[] = [];

  for (const draft of drafts) {
    const references = keepKnownReferences(draft.requirement_ids, known, report);
    if (!references) continue;

    const key = fingerprint(draft.front);
    if (seen.has(key)) {
      report.droppedAsDuplicate += 1;
      continue;
    }
    seen.add(key);

    flashcards.push({
      id: mint(),
      front: draft.front,
      back: draft.back,
      requirement_ids: references,
    });
  }

  return { flashcards, report };
}
