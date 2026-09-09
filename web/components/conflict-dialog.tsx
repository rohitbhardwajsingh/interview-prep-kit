"use client";

import { useEffect, useRef, useState } from "react";

export interface Conflict {
  field: string;
  /** What the user typed, which must never be thrown away silently. */
  yours: string;
  /** What is in the kit now, put there by someone or something else. */
  theirs: string;
}

interface Props {
  conflict: Conflict;
  onResolve(value: string): void;
  onCancel(): void;
}

/**
 * Shown when an edit loses a version race. The user's text is never discarded
 * without them seeing it, because the alternative is exactly the "clobbered my
 * work" failure the whole provenance model exists to prevent. Keeping theirs
 * is offered first only because it is the safe default; theirs is already
 * saved, so choosing it changes nothing.
 */
export function ConflictDialog({ conflict, onResolve, onCancel }: Props) {
  const [merged, setMerged] = useState(conflict.yours);
  const [editing, setEditing] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Escape must always work: a dialog that traps someone mid-edit is worse
    // than the conflict it is reporting.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    dialog.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4">
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="conflict-title"
        tabIndex={-1}
        className="card max-h-[85vh] w-full max-w-3xl overflow-auto p-5 animate-fade-up"
      >
        <h2 id="conflict-title" className="text-lg font-semibold">
          This changed while you were editing
        </h2>
        <p className="mt-1 text-sm text-muted">
          Someone or something else saved a new version of{" "}
          <span className="font-mono text-xs text-paper">{conflict.field}</span>{" "}
          first. Nothing has been lost — decide what to keep.
        </p>

        {editing ? (
          <div className="mt-4">
            <label htmlFor="merged" className="mb-1.5 block text-sm">
              Combine them
            </label>
            <textarea
              id="merged"
              rows={10}
              className="field font-mono text-xs"
              value={merged}
              onChange={(event) => setMerged(event.target.value)}
            />
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <section className="rounded-lg border border-edited/40 bg-edited/5 p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-edited">
                Yours
              </h3>
              <p className="whitespace-pre-wrap text-sm">{conflict.yours}</p>
            </section>
            <section className="rounded-lg border border-ink-line p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Now saved
              </h3>
              <p className="whitespace-pre-wrap text-sm">{conflict.theirs}</p>
            </section>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary"
            onClick={() => onResolve(editing ? merged : conflict.yours)}
          >
            {editing ? "Save the combination" : "Keep mine"}
          </button>
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Keep theirs
          </button>
          {!editing && (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                // Seeded with both, so merging is editing rather than retyping.
                setMerged(`${conflict.yours}\n\n---\n\n${conflict.theirs}`);
                setEditing(true);
              }}
            >
              Combine them
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
