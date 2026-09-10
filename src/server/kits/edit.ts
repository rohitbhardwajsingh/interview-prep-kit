import { z } from "zod";
import {
  MAX_DIFFICULTY,
  MIN_DIFFICULTY,
  QUESTION_CATEGORIES,
} from "../../core/kit/constants";
import {
  FLASHCARD_ID_PREFIX,
  QUESTION_ID_PREFIX,
  createIdMinter,
} from "../../core/kit/ids";
import { markEdited, markPinned, markUnpinned } from "../../core/kit/provenance";
import { reconcileKit } from "../../core/kit/reconcile";
import type { ReconcileReport } from "../../core/kit/reconcile";
import type {
  TrackedFlashcard,
  TrackedKit,
  TrackedQuestion,
} from "../../core/kit/tracked";
import { badRequest, notFound } from "../http/errors";

export const EDITABLE_SECTIONS = ["questions", "flashcards"] as const;
export type EditableSection = (typeof EDITABLE_SECTIONS)[number];

const ID_PREFIX: Record<EditableSection, string> = {
  questions: QUESTION_ID_PREFIX,
  flashcards: FLASHCARD_ID_PREFIX,
};

/** Rejects a patch whose only effect would be to bump the version. */
export function isEmptyPatch(patch: Record<string, unknown>): boolean {
  return Object.keys(patch).length === 0;
}

/**
 * strict, and chosen by section rather than unioned. A union of two
 * all-optional shapes accepts anything: a question patch with a blank prompt
 * fails the question shape, then validates as an empty flashcard patch and
 * saves nothing while reporting success.
 */
const PATCH_SCHEMAS = {
  questions: z
    .object({
      prompt: z.string().trim().min(1, "A question needs a prompt").max(4_000),
      answer_outline: z
        .string()
        .trim()
        .min(1, "A question needs an answer outline")
        .max(8_000),
      // Moving a question between categories is an edit like any other.
      category: z.enum(QUESTION_CATEGORIES),
      difficulty: z.number().int().min(MIN_DIFFICULTY).max(MAX_DIFFICULTY),
      requirement_ids: z
        .array(z.string().trim().min(1))
        .min(1, "A question must test at least one requirement"),
    })
    .partial()
    .strict(),
  flashcards: z
    .object({
      front: z.string().trim().min(1, "A flashcard needs a front").max(2_000),
      back: z.string().trim().min(1, "A flashcard needs a back").max(4_000),
    })
    .partial()
    .strict(),
} as const satisfies Record<EditableSection, z.ZodTypeAny>;

/**
 * A hand-added item. requirement_ids may be empty: a question the user writes
 * from scratch need not cite anything yet, and reconciliation never deletes a
 * user's question for citing nothing. difficulty defaults to the middle.
 */
const ADD_SCHEMAS = {
  questions: z
    .object({
      prompt: z.string().trim().min(1, "A question needs a prompt").max(4_000),
      answer_outline: z
        .string()
        .trim()
        .max(8_000)
        .default("Sketch the answer you would give out loud."),
      category: z.enum(QUESTION_CATEGORIES).default("technical"),
      difficulty: z
        .number()
        .int()
        .min(MIN_DIFFICULTY)
        .max(MAX_DIFFICULTY)
        .default(2),
      requirement_ids: z.array(z.string().trim().min(1)).default([]),
    })
    .strict(),
  flashcards: z
    .object({
      front: z.string().trim().min(1, "A flashcard needs a front").max(2_000),
      back: z.string().trim().min(1, "A flashcard needs a back").max(4_000),
      requirement_ids: z.array(z.string().trim().min(1)).default([]),
    })
    .strict(),
} as const satisfies Record<EditableSection, z.ZodTypeAny>;

export function addItemSchemaFor(section: EditableSection) {
  return z.object({
    version: z.number().int().nonnegative(),
    item: ADD_SCHEMAS[section],
  });
}

export const reorderSchema = z.object({
  version: z.number().int().nonnegative(),
  /** The section's items, in the order they should now appear. */
  orderedIds: z.array(z.string().trim().min(1)).min(1),
});

export const briefEditSchema = z.object({
  version: z.number().int().nonnegative(),
  patch: z
    .object({
      summary: z.string().trim().max(4_000),
      what_they_do: z.string().trim().max(4_000),
    })
    .partial()
    .strict(),
});

export function editItemSchemaFor(section: EditableSection) {
  return z.object({
    version: z.number().int().nonnegative(),
    patch: PATCH_SCHEMAS[section],
  });
}

export const pinItemSchema = z.object({
  version: z.number().int().nonnegative(),
  pinned: z.boolean(),
});

/**
 * Applies one field-level edit and then restores the kit's invariants, because
 * an edit can break them: repointing a question at different requirements
 * changes what is covered, and changes what the schedule should contain. The
 * user edits prose; the deterministic parts are recomputed rather than trusted.
 */
export function applyItemEdit(
  kit: TrackedKit,
  section: EditableSection,
  itemId: string,
  patch: Record<string, unknown>,
): { kit: TrackedKit; report: ReconcileReport } {
  const next = structuredClone(kit);
  const items = next[section];
  const index = items.findIndex((item) => item.id === itemId);
  if (index === -1) throw notFound(`No ${section.slice(0, -1)} with id ${itemId}`);

  const current = items[index];
  if (!current) throw notFound(`No ${section.slice(0, -1)} with id ${itemId}`);

  if ("requirement_ids" in patch && Array.isArray(patch["requirement_ids"])) {
    const known = new Set(next.role.requirements.map((r) => r.id));
    const unknown = (patch["requirement_ids"] as string[]).filter(
      (id) => !known.has(id),
    );
    if (unknown.length > 0) {
      throw badRequest(
        `This kit has no requirement ${unknown.join(", ")}`,
      );
    }
  }

  // Marked edited so a later regeneration knows not to replace it.
  items[index] = markEdited({ ...current, ...patch });

  return reconcileKit(next);
}

export function setPinned(
  kit: TrackedKit,
  section: EditableSection,
  itemId: string,
  pinned: boolean,
): TrackedKit {
  const next = structuredClone(kit);
  const items = next[section];
  const index = items.findIndex((item) => item.id === itemId);
  if (index === -1) throw notFound(`No ${section.slice(0, -1)} with id ${itemId}`);

  const current = items[index];
  if (!current) throw notFound(`No ${section.slice(0, -1)} with id ${itemId}`);

  items[index] = pinned ? markPinned(current) : markUnpinned(current);
  return next;
}

function assertKnownRequirements(kit: TrackedKit, ids: readonly string[]): void {
  const known = new Set(kit.role.requirements.map((requirement) => requirement.id));
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw badRequest(`This kit has no requirement ${unknown.join(", ")}`);
  }
}

/**
 * Adds a hand-written item. It is marked edited from birth, because it is the
 * user's outright — a regeneration must never sweep it away — and it is given
 * the next id in the section's sequence so nothing that already points at an
 * id can be reattached to it.
 */
export function addItem(
  kit: TrackedKit,
  section: EditableSection,
  draft: Record<string, unknown>,
): { kit: TrackedKit; report: ReconcileReport; id: string } {
  const next = structuredClone(kit);

  const requirementIds = (draft["requirement_ids"] as string[] | undefined) ?? [];
  assertKnownRequirements(next, requirementIds);

  const mint = createIdMinter(
    ID_PREFIX[section],
    next[section].map((item) => item.id),
  );
  const id = mint();

  const created = { id, ...draft, provenance: "edited" as const };
  if (section === "questions") {
    next.questions.push(created as unknown as TrackedQuestion);
  } else {
    next.flashcards.push(created as unknown as TrackedFlashcard);
  }

  const { kit: reconciled, report } = reconcileKit(next);
  return { kit: reconciled, report, id };
}

export function deleteItem(
  kit: TrackedKit,
  section: EditableSection,
  itemId: string,
): { kit: TrackedKit; report: ReconcileReport } {
  const next = structuredClone(kit);
  const before = next[section].length;
  if (section === "questions") {
    next.questions = next.questions.filter((item) => item.id !== itemId);
  } else {
    next.flashcards = next.flashcards.filter((item) => item.id !== itemId);
  }
  if (next[section].length === before) {
    throw notFound(`No ${section.slice(0, -1)} with id ${itemId}`);
  }

  return reconcileKit(next);
}

/**
 * Reorders a section to exactly the given order. The argument must be a
 * permutation of the current ids — no additions, no omissions — so a stale
 * client working from a list that has since changed is refused rather than
 * silently dropping or duplicating items.
 */
export function reorderItems(
  kit: TrackedKit,
  section: EditableSection,
  orderedIds: readonly string[],
): { kit: TrackedKit; report: ReconcileReport } {
  const next = structuredClone(kit);
  const byId = new Map(next[section].map((item) => [item.id, item]));

  if (
    orderedIds.length !== byId.size ||
    orderedIds.some((id) => !byId.has(id)) ||
    new Set(orderedIds).size !== orderedIds.length
  ) {
    throw badRequest("Reorder must list exactly the current items, once each");
  }

  if (section === "questions") {
    next.questions = orderedIds.map((id) => byId.get(id) as TrackedQuestion);
  } else {
    next.flashcards = orderedIds.map((id) => byId.get(id) as TrackedFlashcard);
  }

  return reconcileKit(next);
}

/** The brief is prose only, so editing it cannot break coverage or schedule. */
export function editBrief(
  kit: TrackedKit,
  patch: Record<string, unknown>,
): TrackedKit {
  return {
    ...kit,
    company_brief: { ...kit.company_brief, ...patch },
  };
}
