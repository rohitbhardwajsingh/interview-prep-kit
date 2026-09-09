export const REQUIREMENT_ID_PREFIX = "r";
export const QUESTION_ID_PREFIX = "q";
export const FLASHCARD_ID_PREFIX = "f";

function sequentialId(prefix: string, index: number): string {
  return `${prefix}${index + 1}`;
}

export function requirementId(index: number): string {
  return sequentialId(REQUIREMENT_ID_PREFIX, index);
}

export function questionId(index: number): string {
  return sequentialId(QUESTION_ID_PREFIX, index);
}

export function flashcardId(index: number): string {
  return sequentialId(FLASHCARD_ID_PREFIX, index);
}

function highestSuffix(prefix: string, existingIds: Iterable<string>): number {
  const pattern = new RegExp(`^${prefix}(\\d+)$`);
  let highest = 0;
  for (const id of existingIds) {
    const match = pattern.exec(id);
    if (!match?.[1]) continue;
    highest = Math.max(highest, Number.parseInt(match[1], 10));
  }
  return highest;
}

/**
 * Later coverage passes add questions to a kit that already has ids, so new
 * ids continue the existing sequence instead of colliding with it.
 */
export function createIdMinter(
  prefix: string,
  existingIds: Iterable<string>,
): () => string {
  let next = highestSuffix(prefix, existingIds);
  return () => {
    next += 1;
    return `${prefix}${next}`;
  };
}
