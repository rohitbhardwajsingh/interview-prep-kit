"use client";

import { RegenerateSection } from "@/components/regenerate-section";
import type { Provenance, RegenerableSection } from "@/lib/types";

/**
 * Sits above a section and says how much of it is the model's.
 *
 * The count is the point: it tells the user what a rebuild would cost before
 * they ask for one, and it makes pinning visibly worth doing.
 */
export function SectionToolbar({
  section,
  items,
  disabled,
  onRebuild,
}: {
  section: RegenerableSection;
  items: readonly { provenance: Provenance }[];
  disabled: boolean;
  onRebuild: () => Promise<void>;
}) {
  const yours = items.filter((item) => item.provenance !== "generated").length;

  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <p className="text-xs text-faint">
        {yours === 0
          ? `All ${items.length} written by the model.`
          : `${yours} of ${items.length} ${yours === 1 ? "is" : "are"} yours and protected from a rebuild.`}
      </p>
      <RegenerateSection
        section={section}
        items={items}
        disabled={disabled}
        onConfirm={onRebuild}
      />
    </div>
  );
}
