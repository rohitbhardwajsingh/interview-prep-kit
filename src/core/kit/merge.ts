import { createIdMinter } from "./ids";
import { isReplaceable, type Tracked } from "./provenance";

export interface MergeReport {
  /** Protected items inside the scope that survived. */
  kept: number;
  /** Generated items inside the scope that were discarded. */
  replaced: number;
  /** Freshly generated items adopted. */
  added: number;
  /** Items outside the scope, which were never candidates. */
  untouched: number;
}

export interface MergeOptions<TItem, TDraft> {
  existing: readonly TItem[];
  /** Fresh model output, without ids: the merge assigns them. */
  incoming: readonly TDraft[];
  /**
   * Limits the blast radius. Regenerating one category must leave every other
   * category exactly as it was, so anything outside the scope is not a
   * candidate for replacement even when it is still `generated`.
   */
  inScope?: (item: TItem) => boolean;
  idPrefix: string;
}

export interface MergeResult<TItem> {
  items: TItem[];
  report: MergeReport;
}

/**
 * Replaces a regenerated slice of a kit without destroying the user's work.
 *
 * Three rules, in order: anything outside the scope is untouched; anything
 * inside it that the user has edited or pinned is kept; only untouched model
 * output is discarded. New items are appended with ids that continue the
 * existing sequence, so an id never changes meaning and the practice history,
 * schedule references and pins that point at it stay valid.
 */
export function mergeRegenerated<
  TItem extends Tracked & { id: string },
  TDraft extends object,
>(options: MergeOptions<TItem, TDraft>): MergeResult<TItem> {
  const { existing, incoming, inScope = () => true, idPrefix } = options;

  const report: MergeReport = {
    kept: 0,
    replaced: 0,
    added: 0,
    untouched: 0,
  };

  const survivors: TItem[] = [];

  for (const item of existing) {
    if (!inScope(item)) {
      report.untouched += 1;
      survivors.push(item);
      continue;
    }

    if (isReplaceable(item)) {
      report.replaced += 1;
      continue;
    }

    report.kept += 1;
    survivors.push(item);
  }

  // Minted against every id the kit has ever handed out in this pass, including
  // the ones just replaced. Counting only survivors would recycle a discarded
  // id, and a pin, a schedule slot or a practice record still pointing at it
  // would silently reattach to different content.
  const mint = createIdMinter(
    idPrefix,
    existing.map((item) => item.id),
  );

  const added = incoming.map(
    (draft) =>
      ({
        ...draft,
        id: mint(),
        provenance: "generated",
      }) as unknown as TItem,
  );
  report.added = added.length;

  return { items: [...survivors, ...added], report };
}

export function describeMerge(report: MergeReport): string {
  return [
    `${report.added} new`,
    `${report.kept} kept`,
    `${report.replaced} replaced`,
    `${report.untouched} untouched`,
  ].join(", ");
}
