import { z } from "zod";
import { markEdited, markPinned, markUnpinned } from "../../core/kit/provenance";
import { reconcileKit } from "../../core/kit/reconcile";
import type { ReconcileReport } from "../../core/kit/reconcile";
import type { TrackedKit } from "../../core/kit/tracked";
import { badRequest, notFound } from "../http/errors";

export const EDITABLE_SECTIONS = ["questions", "flashcards"] as const;
export type EditableSection = (typeof EDITABLE_SECTIONS)[number];

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
