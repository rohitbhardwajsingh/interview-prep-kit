"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { KitDetail } from "@/lib/types";

interface ReviewState {
  questionId: string;
  box: number;
  dueOnDay: number;
  lastConfidence: number | null;
  timesSeen: number;
}

interface PracticeBody {
  day: number;
  daysAvailable: number;
  queue: ReviewState[];
  progress: {
    total: number;
    attempted: number;
    solid: number;
    shaky: number;
    dueToday: number;
  };
}

const CONFIDENCE: { value: number; label: string; hint: string; tone: string }[] = [
  { value: 1, label: "No idea", hint: "Back to the start", tone: "border-bad/50 text-bad" },
  { value: 2, label: "Shaky", hint: "Back to the start", tone: "border-bad/40 text-bad" },
  { value: 3, label: "Partly", hint: "Same interval again", tone: "border-warn/40 text-warn" },
  { value: 4, label: "Good", hint: "Longer interval", tone: "border-good/40 text-good" },
  { value: 5, label: "Nailed it", hint: "Longest interval", tone: "border-good/50 text-good" },
];

export default function PracticePage() {
  const { kitId } = useParams<{ kitId: string }>();
  const [kit, setKit] = useState<KitDetail | null>(null);
  const [practice, setPractice] = useState<PracticeBody | null>(null);
  const [day, setDay] = useState(1);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (forDay: number, signal?: AbortSignal) => {
      try {
        const [kitBody, practiceBody] = await Promise.all([
          api<{ kit: KitDetail }>(`/kits/${kitId}`, { signal }),
          api<PracticeBody>(`/kits/${kitId}/practice?day=${forDay}`, { signal }),
        ]);
        setKit(kitBody.kit);
        setPractice(practiceBody);
        setError(null);
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof ApiError ? cause.message : "Could not load");
      }
    },
    [kitId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(day, controller.signal);
    return () => controller.abort();
  }, [load, day]);

  const current = practice?.queue[0];
  const question = kit?.kit?.questions.find((q) => q.id === current?.questionId);

  async function rate(confidence: number) {
    if (!current) return;
    setBusy(true);
    try {
      await api(`/kits/${kitId}/practice/${current.questionId}`, {
        method: "POST",
        body: { confidence, day },
      });
      setRevealed(false);
      // Re-read rather than mutating locally, so the next item comes from the
      // same scheduler the server just updated.
      await load(day);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not save that");
    } finally {
      setBusy(false);
    }
  }

  if (error && !kit) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
        <Link href={`/kits/${kitId}`} className="btn-ghost mt-4">
          Back to the kit
        </Link>
      </main>
    );
  }

  if (!practice || !kit) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-sm text-muted">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <Link href={`/kits/${kitId}`} className="text-sm text-muted hover:text-paper">
        ← {kit.title}
      </Link>

      <header className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Practice</h1>
          <p className="mt-1 text-sm text-muted">
            Rate yourself honestly. Weak answers come back sooner.
          </p>
        </div>

        <label className="text-xs text-muted">
          Day of your plan
          <select
            className="field mt-1 w-24"
            value={day}
            onChange={(event) => {
              setDay(Number(event.target.value));
              setRevealed(false);
            }}
          >
            {Array.from({ length: practice.daysAvailable }, (_, index) => (
              <option key={index + 1} value={index + 1}>
                Day {index + 1}
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="mt-6 grid grid-cols-4 gap-2 text-center">
        {(
          [
            ["Due now", practice.progress.dueToday, "text-paper"],
            ["Seen", practice.progress.attempted, "text-muted"],
            ["Solid", practice.progress.solid, "text-good"],
            ["Shaky", practice.progress.shaky, "text-warn"],
          ] as const
        ).map(([label, value, tone]) => (
          <div key={label} className="card p-3">
            <p className={`text-xl font-semibold ${tone}`}>{value}</p>
            <p className="text-[11px] text-muted">{label}</p>
          </div>
        ))}
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad"
        >
          {error}
        </p>
      )}

      {!current || !question ? (
        <div className="card mt-8 p-8 text-center">
          <p className="font-medium">Nothing due on day {day}</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">
            {practice.progress.attempted === 0
              ? "This kit has no questions to practise yet."
              : "Everything you have rated is scheduled for a later day. Move the day forward to look ahead."}
          </p>
        </div>
      ) : (
        <article className="card mt-8 p-6">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] text-muted">
              {question.id}
            </span>
            <span className="chip border-ink-line text-muted">
              {question.category}
            </span>
            {current.timesSeen === 0 ? (
              <span className="chip border-edited/50 text-edited">First time</span>
            ) : (
              <span className="chip border-ink-line text-muted">
                seen {current.timesSeen}× · box {current.box}
              </span>
            )}
          </div>

          <h2 className="text-lg font-medium leading-snug">{question.prompt}</h2>

          <p className="mt-3 flex flex-wrap gap-1.5">
            {question.requirement_ids.map((id) => (
              <span
                key={id}
                title={kit.kit?.role.requirements.find((r) => r.id === id)?.text}
                className="chip border-ink-line text-muted"
              >
                {id}
              </span>
            ))}
          </p>

          {/* Answer first, then rate: seeing the outline before committing to
              an answer is how people talk themselves into "I knew that". */}
          {revealed ? (
            <>
              <div className="mt-5 rounded-lg border border-ink-line bg-ink p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  What a good answer covers
                </p>
                <p className="whitespace-pre-wrap text-sm text-paper">
                  {question.answer_outline}
                </p>
              </div>

              <fieldset className="mt-5" disabled={busy}>
                <legend className="mb-2 text-sm">How did that go?</legend>
                <div className="flex flex-wrap gap-2">
                  {CONFIDENCE.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => void rate(option.value)}
                      className={`btn border ${option.tone} flex-col items-start
                        gap-0 px-3 py-2 hover:bg-ink-line disabled:opacity-40`}
                    >
                      <span className="text-sm font-medium">{option.label}</span>
                      <span className="text-[10px] font-normal text-muted">
                        {option.hint}
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>
            </>
          ) : (
            <button
              type="button"
              className="btn-primary mt-5"
              onClick={() => setRevealed(true)}
            >
              Answer it out loud, then reveal
            </button>
          )}
        </article>
      )}

      {practice.queue.length > 1 && (
        <p className="mt-4 text-center text-xs text-muted">
          {practice.queue.length - 1} more due after this one
        </p>
      )}
    </main>
  );
}
