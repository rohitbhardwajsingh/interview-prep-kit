"use client";

import { useMemo, useState } from "react";
import { Editable } from "@/components/editable";
import { useKitContext } from "@/components/kit-provider";
import { KitNotReady } from "@/components/kit-not-ready";
import { ProvenanceBadge } from "@/components/provenance-badge";
import { QuestionCard } from "@/components/question-card";
import { SectionToolbar } from "@/components/section-toolbar";
import { categoryMeta } from "@/lib/categories";
import type { Question } from "@/lib/types";

const CATEGORIES = [
  "all",
  "technical",
  "behavioural",
  "system-design",
  "company-fit",
] as const;

export default function QuestionsPage() {
  const { kit, save, togglePin, rebuild } = useKitContext();
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("all");
  const [query, setQuery] = useState("");

  const body = kit?.kit;

  const shown = useMemo<Question[]>(() => {
    if (!body) return [];
    const needle = query.trim().toLowerCase();
    return body.questions.filter((question) => {
      if (category !== "all" && question.category !== category) return false;
      if (needle === "") return true;
      return (
        question.prompt.toLowerCase().includes(needle) ||
        question.answer_outline.toLowerCase().includes(needle)
      );
    });
  }, [body, category, query]);

  if (!body) return <KitNotReady />;

  const building = kit?.status === "generating";

  return (
    <div className="space-y-10">
      <section>
        <SectionToolbar
          section="questions"
          items={body.questions}
          disabled={building}
          onRebuild={() => rebuild("questions")}
        />

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter questions…"
            aria-label="Filter questions"
            className="field max-w-xs"
          />
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((entry) => {
              const active = category === entry;
              const meta = entry === "all" ? null : categoryMeta(entry);
              const count =
                entry === "all"
                  ? body.questions.length
                  : body.questions.filter((q) => q.category === entry).length;
              return (
                <button
                  key={entry}
                  type="button"
                  onClick={() => setCategory(entry)}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-1.5 rounded-lg border
                    px-2.5 py-1.5 text-xs font-medium transition ${
                      active
                        ? "border-line-strong bg-surface-high text-paper"
                        : "border-transparent text-faint hover:bg-surface-high hover:text-paper"
                    }`}
                >
                  {meta ? (
                    <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                  ) : null}
                  {meta ? meta.label : "All"}
                  <span className="tnum text-faint">{count}</span>
                </button>
              );
            })}
          </div>
          <span className="ml-auto text-xs text-faint">
            {shown.length} of {body.questions.length}
          </span>
        </div>

        {shown.length === 0 ? (
          <p className="card-quiet p-6 text-center text-sm text-faint">
            Nothing matches that filter.
          </p>
        ) : (
          <ul className="stagger space-y-3">
            {shown.map((question, index) => (
              <div
                key={question.id}
                style={{ "--i": Math.min(index, 8) } as React.CSSProperties}
                className="contents"
              >
                <QuestionCard
                  question={question}
                  requirements={body.role.requirements}
                />
              </div>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-medium">Flashcards</h2>
        <SectionToolbar
          section="flashcards"
          items={body.flashcards}
          disabled={building}
          onRebuild={() => rebuild("flashcards")}
        />

        <ul className="grid gap-3 sm:grid-cols-2">
          {body.flashcards.map((card) => (
            <li key={card.id} className="card-interactive p-5">
              <div className="mb-2 flex items-center gap-2">
                <span className="font-mono text-[11px] text-faint">
                  {card.id}
                </span>
                <ProvenanceBadge state={card.provenance} />
                <button
                  type="button"
                  onClick={() =>
                    void togglePin(
                      "flashcards",
                      card.id,
                      card.provenance !== "pinned",
                    )
                  }
                  className={`ml-auto text-xs transition ${
                    card.provenance === "pinned"
                      ? "text-pinned"
                      : "text-faint hover:text-pinned"
                  }`}
                >
                  {card.provenance === "pinned" ? "Pinned" : "Pin"}
                </button>
              </div>

              <div className="text-sm font-medium">
                <Editable
                  label={`Front of ${card.id}`}
                  value={card.front}
                  multiline
                  onSave={(next) => save("flashcards", card.id, "front", next)}
                />
              </div>
              <div className="mt-2 text-sm text-dim">
                <Editable
                  label={`Back of ${card.id}`}
                  value={card.back}
                  multiline
                  onSave={(next) => save("flashcards", card.id, "back", next)}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
