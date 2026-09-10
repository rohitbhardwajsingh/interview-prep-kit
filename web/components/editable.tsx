"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  value: string;
  label: string;
  multiline?: boolean;
  onSave(next: string): Promise<void>;
}

/**
 * Edit in place, commit on blur or Ctrl/Cmd+Enter, abandon on Escape. The
 * draft is held locally while saving so a slow or failed save never blanks
 * what the user typed.
 */
export function Editable({ value, label, multiline, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);

  useEffect(() => {
    // Adopts an outside change only when not mid-edit, so a poll landing
    // during typing cannot overwrite the draft.
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) field.current?.focus();
  }, [editing]);

  async function commit() {
    const next = draft.trim();
    if (next === value.trim() || next.length === 0) {
      setDraft(value);
      setEditing(false);
      setError(null);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave(next);
      setEditing(false);
    } catch (cause) {
      // Stays open holding the draft, so the text survives the failure.
      setError(cause instanceof Error ? cause.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Edit ${label}`}
        className="-mx-1.5 -my-1 block w-full rounded px-1.5 py-1 text-left
          hover:bg-surface-high/50 focus-visible:bg-surface-high/50"
      >
        <span className="whitespace-pre-wrap">{value}</span>
      </button>
    );
  }

  const shared = {
    "aria-label": label,
    className: "field",
    value: draft,
    disabled: saving,
    onBlur: () => void commit(),
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === "Escape") {
        setDraft(value);
        setEditing(false);
        setError(null);
      }
      // Enter alone inserts a newline in prose, so commit needs a modifier.
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        void commit();
      }
    },
  };

  return (
    <div className="space-y-1.5">
      {multiline ? (
        <textarea
          {...shared}
          ref={field as React.RefObject<HTMLTextAreaElement>}
          rows={5}
          onChange={(event) => setDraft(event.target.value)}
        />
      ) : (
        <input
          {...shared}
          ref={field as React.RefObject<HTMLInputElement>}
          onChange={(event) => setDraft(event.target.value)}
        />
      )}
      {/* Blur also commits, but relying on it alone leaves people unsure
          whether their change took, so the action is offered explicitly. */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn-primary px-2 py-1 text-xs"
          disabled={saving}
          // mousedown fires before blur, so the click is not lost to the
          // field's own blur handler tearing the buttons down first.
          onMouseDown={(event) => {
            event.preventDefault();
            void commit();
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className="btn-ghost px-2 py-1 text-xs"
          disabled={saving}
          onMouseDown={(event) => {
            event.preventDefault();
            setDraft(value);
            setEditing(false);
            setError(null);
          }}
        >
          Cancel
        </button>
        <span className="text-[11px] text-dim">Esc to discard · ⌘↵ to save</span>
      </div>
      {error && (
        <p role="alert" className="text-[11px] text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
