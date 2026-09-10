"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ApiError } from "@/lib/api";
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
  const { kit, save, togglePin, rebuild, addItem, removeItem, reorder, setNotice } =
    useKitContext();
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("all");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState<"question" | "flashcard" | null>(null);

  const body = kit?.kit;

  // Reordering only makes sense over the whole, unfiltered list; when a filter
  // is on, "up" would jump past hidden items, so the controls are hidden.
  const canReorder = category === "all" && query.trim() === "";

  async function move(index: number, direction: -1 | 1) {
    if (!body) return;
    const ids = body.questions.map((question) => question.id);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    try {
      await reorder("questions", ids);
    } catch {
      setNotice("Could not reorder. Reload and try again.");
    }
  }

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
            {shown.map((question) => {
              const fullIndex = body.questions.findIndex(
                (entry) => entry.id === question.id,
              );
              return (
                <div
                  key={question.id}
                  style={
                    { "--i": Math.min(fullIndex, 8) } as React.CSSProperties
                  }
                  className="contents"
                >
                  <QuestionCard
                    question={question}
                    requirements={body.role.requirements}
                    onMoveUp={canReorder ? () => void move(fullIndex, -1) : undefined}
                    onMoveDown={
                      canReorder ? () => void move(fullIndex, 1) : undefined
                    }
                    isFirst={fullIndex === 0}
                    isLast={fullIndex === body.questions.length - 1}
                  />
                </div>
              );
            })}
          </ul>
        )}

        {adding === "question" ? (
          <AddQuestionForm
            onCancel={() => setAdding(null)}
            onAdd={async (item) => {
              await addItem("questions", item);
              setAdding(null);
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding("question")}
            className="btn-ghost mt-3"
          >
            <Plus className="h-4 w-4" />
            Add a question
          </button>
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
                <span className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      void togglePin(
                        "flashcards",
                        card.id,
                        card.provenance !== "pinned",
                      )
                    }
                    className={`text-xs transition ${
                      card.provenance === "pinned"
                        ? "text-pinned"
                        : "text-faint hover:text-pinned"
                    }`}
                  >
                    {card.provenance === "pinned" ? "Pinned" : "Pin"}
                  </button>
                  <button
                    type="button"
                    aria-label="Delete flashcard"
                    title="Delete this flashcard"
                    onClick={() => {
                      if (window.confirm("Delete this flashcard?")) {
                        void removeItem("flashcards", card.id).catch(() =>
                          setNotice("Could not delete that flashcard."),
                        );
                      }
                    }}
                    className="rounded-md p-1 text-faint transition hover:bg-bad/10 hover:text-bad"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
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

        {adding === "flashcard" ? (
          <AddFlashcardForm
            onCancel={() => setAdding(null)}
            onAdd={async (item) => {
              await addItem("flashcards", item);
              setAdding(null);
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding("flashcard")}
            className="btn-ghost mt-4"
          >
            <Plus className="h-4 w-4" />
            Add a flashcard
          </button>
        )}
      </section>
    </div>
  );
}

/** A compact inline composer for a hand-written question. */
function AddQuestionForm({
  onAdd,
  onCancel,
}: {
  onAdd: (item: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [cat, setCat] = useState("technical");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onAdd({
        prompt,
        answer_outline: answer || undefined,
        category: cat,
      });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not add that");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card mt-3 space-y-3 p-4">
      <textarea
        autoFocus
        required
        rows={2}
        className="field"
        placeholder="Your question…"
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
      />
      <textarea
        rows={2}
        className="field text-sm"
        placeholder="Answer outline (optional)"
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
      />
      <div className="flex items-center gap-2">
        <select
          aria-label="Category"
          className="field w-auto"
          value={cat}
          onChange={(event) => setCat(event.target.value)}
        >
          {["technical", "behavioural", "system-design", "company-fit"].map(
            (option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ),
          )}
        </select>
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? "Adding…" : "Add question"}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost">
          Cancel
        </button>
      </div>
      {error && <p className="text-sm text-bad">{error}</p>}
    </form>
  );
}

function AddFlashcardForm({
  onAdd,
  onCancel,
}: {
  onAdd: (item: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onAdd({ front, back });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not add that");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card mt-4 space-y-3 p-4">
      <input
        autoFocus
        required
        className="field"
        placeholder="Front (the prompt)"
        value={front}
        onChange={(event) => setFront(event.target.value)}
      />
      <textarea
        required
        rows={2}
        className="field"
        placeholder="Back (the answer)"
        value={back}
        onChange={(event) => setBack(event.target.value)}
      />
      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? "Adding…" : "Add flashcard"}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost">
          Cancel
        </button>
      </div>
      {error && <p className="text-sm text-bad">{error}</p>}
    </form>
  );
}
