"use client";

import type { Provenance } from "@/lib/types";

const COPY: Record<Provenance, { label: string; title: string; tone: string }> = {
  generated: {
    label: "Generated",
    title: "Written by the model. A regeneration may replace this.",
    tone: "border-line text-generated",
  },
  edited: {
    label: "Yours",
    title: "You changed this, so a regeneration will keep it.",
    tone: "border-edited/50 text-edited",
  },
  pinned: {
    label: "Pinned",
    title: "Protected. Nothing will replace this until you unpin it.",
    tone: "border-pinned/50 text-pinned",
  },
};

/**
 * The provenance states are only trustworthy if they are visible, so an item
 * that would survive a rebuild says so. "Generated" is the default and gets
 * no badge: badging every model-written item just adds noise to a list that
 * is mostly model-written, and the absence of a badge already means it.
 */
export function ProvenanceBadge({ state }: { state: Provenance }) {
  if (state === "generated") return null;

  const copy = COPY[state];
  return (
    <span className={`chip ${copy.tone}`} title={copy.title}>
      {copy.label}
    </span>
  );
}
