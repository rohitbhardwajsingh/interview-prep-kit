"use client";

import { ChevronDown, ChevronUp, Pin, PinOff, Trash2 } from "lucide-react";
import { Editable } from "@/components/editable";
import { useKitContext } from "@/components/kit-provider";
import { ProvenanceBadge } from "@/components/provenance-badge";
import { categoryMeta } from "@/lib/categories";
import type { Question, Requirement } from "@/lib/types";

const CATEGORY_OPTIONS = [
  "technical",
  "behavioural",
  "system-design",
  "company-fit",
] as const;

/** Difficulty as filled dots, so it reads without parsing "difficulty 2". */
function Difficulty({ level }: { level: number }) {
  return (
    <span className="flex items-center gap-1" title={`Difficulty ${level} of 3`}>
      {[1, 2, 3].map((step) => (
        <span
          key={step}
          className={`h-1.5 w-1.5 rounded-full ${
            step <= level ? "bg-dim" : "bg-line-strong"
          }`}
        />
      ))}
    </span>
  );
}

export function QuestionCard({
  question,
  requirements,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  question: Question;
  requirements: Requirement[];
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  const { save, togglePin, removeItem, setNotice } = useKitContext();
  const pinned = question.provenance === "pinned";
  const meta = categoryMeta(question.category);

  async function remove() {
    if (!window.confirm("Delete this question? This cannot be undone.")) return;
    try {
      await removeItem("questions", question.id);
    } catch {
      setNotice("Could not delete that question. Reload and try again.");
    }
  }

  return (
    <li
      className={`card-interactive overflow-hidden border-l-4 p-5 ${meta.border}`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {/* Move within the bank. Reordering is a click, applied server-side
            and reflected back, so it stays consistent with the schedule. */}
        {(onMoveUp || onMoveDown) && (
          <span className="flex items-center">
            <button
              type="button"
              onClick={onMoveUp}
              disabled={isFirst}
              aria-label="Move question up"
              className="rounded-md p-1 text-faint transition hover:bg-surface-high hover:text-paper disabled:opacity-30"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={isLast}
              aria-label="Move question down"
              className="rounded-md p-1 text-faint transition hover:bg-surface-high hover:text-paper disabled:opacity-30"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </span>
        )}

        {/* Category is a control, not a label: moving a question between
            categories is one of the edits the builder must support. */}
        <span
          className={`inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1
            text-[11px] font-semibold ${meta.bgSoft} ${meta.text}`}
        >
          <meta.icon className="h-3.5 w-3.5" />
          <select
            aria-label="Question category"
            value={question.category}
            onChange={(event) =>
              void save("questions", question.id, "category", event.target.value)
            }
            className={`cursor-pointer bg-transparent pr-1 font-semibold outline-none ${meta.text}`}
          >
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option} value={option} className="bg-surface text-paper">
                {categoryMeta(option).label}
              </option>
            ))}
          </select>
        </span>
        <Difficulty level={question.difficulty} />
        <ProvenanceBadge state={question.provenance} />
        <span className="font-mono text-[11px] text-faint">{question.id}</span>

        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => void togglePin("questions", question.id, !pinned)}
            aria-pressed={pinned}
            title={pinned ? "Unpin — allow rebuilds to replace it" : "Pin — protect from rebuilds"}
            className={`inline-flex items-center gap-1 rounded-lg px-2 py-1
              text-xs transition ${
                pinned
                  ? "bg-pinned/10 text-pinned"
                  : "text-faint hover:bg-surface-high hover:text-pinned"
              }`}
          >
            {pinned ? (
              <PinOff className="h-3.5 w-3.5" />
            ) : (
              <Pin className="h-3.5 w-3.5" />
            )}
            {pinned ? "Pinned" : "Pin"}
          </button>
          <button
            type="button"
            onClick={() => void remove()}
            aria-label="Delete question"
            title="Delete this question"
            className="rounded-lg p-1.5 text-faint transition hover:bg-bad/10 hover:text-bad"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </span>
      </div>

      <div className="text-[15px] font-medium leading-relaxed">
        <Editable
          label={`Question ${question.id}`}
          value={question.prompt}
          multiline
          onSave={(next) => save("questions", question.id, "prompt", next)}
        />
      </div>

      <details className="group mt-3">
        <summary
          className="inline-flex cursor-pointer list-none items-center gap-1
            rounded-lg px-2 py-1 text-xs font-medium text-faint transition
            hover:bg-surface-high hover:text-paper"
        >
          <span className="inline-block transition group-open:rotate-90">›</span>
          Answer outline
        </summary>
        <div
          className="mt-2 rounded-xl border border-line bg-surface p-3 text-sm
            leading-relaxed text-dim"
        >
          <Editable
            label={`Answer outline for ${question.id}`}
            value={question.answer_outline}
            multiline
            onSave={(next) =>
              save("questions", question.id, "answer_outline", next)
            }
          />
        </div>
      </details>

      {/* Requirement ids are shown rather than hidden: they are how the user
          checks the question is about the job they applied for. */}
      <p className="mt-4 flex flex-wrap gap-1.5">
        {question.requirement_ids.map((id) => (
          <span
            key={id}
            title={requirements.find((entry) => entry.id === id)?.text}
            className="chip border-line text-faint"
          >
            {id}
          </span>
        ))}
      </p>
    </li>
  );
}
