"use client";

import { Pin, PinOff } from "lucide-react";
import { Editable } from "@/components/editable";
import { useKitContext } from "@/components/kit-provider";
import { ProvenanceBadge } from "@/components/provenance-badge";
import { categoryMeta } from "@/lib/categories";
import type { Question, Requirement } from "@/lib/types";

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
}: {
  question: Question;
  requirements: Requirement[];
}) {
  const { save, togglePin } = useKitContext();
  const pinned = question.provenance === "pinned";
  const meta = categoryMeta(question.category);

  return (
    <li
      className={`card-interactive overflow-hidden border-l-4 p-5 ${meta.border}`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1
            text-[11px] font-semibold ${meta.bgSoft} ${meta.text}`}
        >
          <meta.icon className="h-3.5 w-3.5" />
          {meta.label}
        </span>
        <Difficulty level={question.difficulty} />
        <ProvenanceBadge state={question.provenance} />
        <span className="font-mono text-[11px] text-faint">{question.id}</span>

        <button
          type="button"
          onClick={() => void togglePin("questions", question.id, !pinned)}
          aria-pressed={pinned}
          title={pinned ? "Unpin — allow rebuilds to replace it" : "Pin — protect from rebuilds"}
          className={`ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1
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
