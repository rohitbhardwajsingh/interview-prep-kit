"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import type { Provenance, RegenerableSection } from "@/lib/types";

interface RegenerateSectionProps {
  section: RegenerableSection;
  /** Provenance of every item in the section, which decides what survives. */
  items: readonly { provenance: Provenance }[];
  disabled?: boolean;
  onConfirm: () => Promise<void>;
}

const NOUN: Record<RegenerableSection, [string, string]> = {
  questions: ["question", "questions"],
  flashcards: ["flashcard", "flashcards"],
};

function plural(section: RegenerableSection, count: number): string {
  const [one, many] = NOUN[section];
  return count === 1 ? one : many;
}

/**
 * Asks before rebuilding, and says exactly what the rebuild will cost.
 *
 * The provenance model already guarantees edits and pins survive, but a user
 * cannot see a guarantee — so the counts are spelled out before the click
 * rather than explained afterwards, and the case where nothing is protected
 * is called out as the loss it actually is.
 */
export function RegenerateSection({
  section,
  items,
  disabled,
  onConfirm,
}: RegenerateSectionProps) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kept = items.filter((item) => item.provenance !== "generated").length;
  const replaced = items.length - kept;

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      setAsking(false);
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : `Could not rebuild the ${plural(section, 2)}`,
      );
    } finally {
      setBusy(false);
    }
  }

  if (!asking) {
    return (
      <button
        type="button"
        className="btn-ghost px-2 py-1 text-xs"
        disabled={disabled}
        onClick={() => {
          setError(null);
          setAsking(true);
        }}
      >
        Rebuild {plural(section, 2)}
      </button>
    );
  }

  return (
    <div className="card border-edited/40 p-3 text-xs">
      <p className="text-paper">
        {replaced > 0 ? (
          <>
            Writes new {plural(section, replaced)} over the{" "}
            <strong>{replaced}</strong> the model wrote.
          </>
        ) : (
          <>Adds new {plural(section, 2)} alongside yours.</>
        )}{" "}
        {kept > 0 ? (
          <span className="text-muted">
            The <strong className="text-edited">{kept}</strong> you edited or
            pinned {kept === 1 ? "stays" : "stay"} exactly as {kept === 1 ? "it is" : "they are"}.
          </span>
        ) : (
          <span className="text-warn">
            You have not edited or pinned anything here, so none of the current
            wording will survive.
          </span>
        )}
      </p>

      {error && <p className="mt-2 text-warn">{error}</p>}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          className="btn-primary px-2 py-1 text-xs"
          disabled={busy}
          onClick={() => void confirm()}
        >
          {busy ? "Starting…" : "Rebuild"}
        </button>
        <button
          type="button"
          className="btn-ghost px-2 py-1 text-xs"
          disabled={busy}
          onClick={() => setAsking(false)}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
