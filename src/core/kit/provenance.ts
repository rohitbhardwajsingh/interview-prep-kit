/**
 * Why an item is in the kit, which is the only thing that decides whether a
 * regeneration may replace it.
 *
 * - `generated` — the model wrote it and the user has not touched it. Only
 *   these are ever discarded, which makes "do not clobber my work" a property
 *   of the data rather than something the interface has to remember.
 * - `edited` — the user changed it, or wrote it themselves. Their text.
 * - `pinned` — the user asked for it to be kept as-is, without changing it.
 *
 * `edited` and `pinned` differ in intent, not in protection: an edit says "this
 * wording is mine", a pin says "keep this even though I have not touched it".
 * Both survive regeneration, and the interface shows them differently.
 */
export const PROVENANCE_STATES = ["generated", "edited", "pinned"] as const;

export type ProvenanceState = (typeof PROVENANCE_STATES)[number];

export interface Tracked {
  provenance: ProvenanceState;
}

export function isProvenanceState(value: unknown): value is ProvenanceState {
  return (
    typeof value === "string" &&
    (PROVENANCE_STATES as readonly string[]).includes(value)
  );
}

/** Anything the user has claimed, by editing or pinning it. */
export function isProtected(item: Tracked): boolean {
  return item.provenance !== "generated";
}

export function isReplaceable(item: Tracked): boolean {
  return item.provenance === "generated";
}

/** Marks fresh model output, which is always replaceable until touched. */
export function asGenerated<T>(item: T): T & Tracked {
  return { ...item, provenance: "generated" };
}

export function asGeneratedAll<T>(items: readonly T[]): Array<T & Tracked> {
  return items.map(asGenerated);
}

/**
 * An edit always transfers ownership to the user, including on an item they had
 * pinned: a pin they then rewrote is theirs by the stronger claim.
 */
export function markEdited<T extends Tracked>(item: T): T {
  return { ...item, provenance: "edited" };
}

/**
 * Pinning never overwrites an edit, because that would downgrade a stronger
 * claim to a weaker one while promising the user nothing changed.
 */
export function markPinned<T extends Tracked>(item: T): T {
  if (item.provenance === "edited") return item;
  return { ...item, provenance: "pinned" };
}

/** Releases a pin. An edit cannot be released; the user's text is still theirs. */
export function markUnpinned<T extends Tracked>(item: T): T {
  if (item.provenance !== "pinned") return item;
  return { ...item, provenance: "generated" };
}

/** Drops tracking, for the plain Appendix A shape the batch command emits. */
export function untrack<T extends Tracked>(item: T): Omit<T, "provenance"> {
  const { provenance: _provenance, ...rest } = item;
  return rest;
}
