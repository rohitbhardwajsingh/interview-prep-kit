"use client";

import { Editable } from "@/components/editable";
import { useKitContext } from "@/components/kit-provider";
import { ProvenanceBadge } from "@/components/provenance-badge";
import type { Question, Requirement } from "@/lib/types";

export function QuestionCard({
  question,
  requirements,
}: {
  question: Question;
  requirements: Requirement[];
}) {
  const { save, togglePin } = useKitContext();
  const pinned = question.provenance === "pinned";

  return (
    <li className="card-interactive p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] text-faint">{question.id}</span>
        <span className="chip border-line text-dim">{question.category}</span>
        <span className="chip border-line text-dim">
          difficulty {question.difficulty}
        </span>
        <ProvenanceBadge state={question.provenance} />

        <button
          type="button"
          onClick={() => void togglePin("questions", question.id, !pinned)}
          aria-pressed={pinned}
          className={`ml-auto text-xs transition ${
            pinned ? "text-pinned" : "text-faint hover:text-pinned"
          }`}
        >
          {pinned ? "Pinned" : "Pin"}
        </button>
      </div>

      <div className="font-medium">
        <Editable
          label={`Question ${question.id}`}
          value={question.prompt}
          multiline
          onSave={(next) => save("questions", question.id, "prompt", next)}
        />
      </div>

      <details className="group mt-3">
        <summary
          className="cursor-pointer list-none text-xs text-faint transition
            hover:text-paper"
        >
          <span className="inline-block transition group-open:rotate-90">›</span>{" "}
          Answer outline
        </summary>
        <div className="mt-2 text-sm text-dim">
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
