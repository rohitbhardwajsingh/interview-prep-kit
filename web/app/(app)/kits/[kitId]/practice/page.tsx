"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useKitContext } from "@/components/kit-provider";
import { api, ApiError } from "@/lib/api";
import { useToday } from "@/lib/use-today";

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

/**
 * Five grades, each bound to the digit above the letters. The hint says what
 * the grade does to the schedule, because a rating whose consequence is
 * hidden gets guessed at, and a guessed rating makes the spacing worthless.
 */
const CONFIDENCE = [
  { value: 1, label: "No idea", hint: "Start again", tone: "bad" },
  { value: 2, label: "Shaky", hint: "Start again", tone: "bad" },
  { value: 3, label: "Partly", hint: "Same interval", tone: "warn" },
  { value: 4, label: "Good", hint: "Longer gap", tone: "good" },
  { value: 5, label: "Nailed it", hint: "Longest gap", tone: "good" },
] as const;

const TONE: Record<string, string> = {
  bad: "border-bad/40 text-bad hover:border-bad hover:bg-bad/10",
  warn: "border-warn/40 text-warn hover:border-warn hover:bg-warn/10",
  good: "border-good/40 text-good hover:border-good hover:bg-good/10",
};

export default function PracticePage() {
  const { kit, kitId } = useKitContext();
  const ready = kit?.status === "ready" && kit.kit !== null;
  const { today } = useToday(kitId, ready);

  const [practice, setPractice] = useState<PracticeBody | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The day comes from the calendar rather than a picker: which day it is is
  // a fact, not a preference, and asking the user to choose invites them to
  // quietly re-answer yesterday.
  const day = today?.calendar.todayDay ?? 1;

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!ready) return;
      try {
        const body = await api<PracticeBody>(
          `/kits/${kitId}/practice?day=${day}`,
          { signal },
        );
        setPractice(body);
        setError(null);
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof ApiError ? cause.message : "Could not load");
      }
    },
    [kitId, day, ready],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const current = practice?.queue[0];
  const question = kit?.kit?.questions.find(
    (entry) => entry.id === current?.questionId,
  );

  const rate = useCallback(
    async (confidence: number) => {
      if (!current || busy) return;
      setBusy(true);
      try {
        await api(`/kits/${kitId}/practice/${current.questionId}`, {
          method: "POST",
          body: { confidence, day },
        });
        setRevealed(false);
        // Re-read rather than mutating locally, so the next item comes from
        // the same scheduler the server just updated.
        await load();
      } catch (cause) {
        setError(
          cause instanceof ApiError ? cause.message : "Could not save that",
        );
      } finally {
        setBusy(false);
      }
    },
    [current, busy, kitId, day, load],
  );

  // The whole session is drivable without the mouse: space to see the
  // answer, then one digit to grade it. Anything slower than that and people
  // stop doing spaced repetition after two days.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (["INPUT", "TEXTAREA"].includes(target?.tagName ?? "")) return;
      if (!current) return;

      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        setRevealed(true);
        return;
      }

      const digit = Number(event.key);
      if (digit >= 1 && digit <= 5) {
        event.preventDefault();
        // Grading without looking is allowed: if you knew it, you knew it.
        void rate(digit);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, rate]);

  if (!ready) {
    return <p className="text-sm text-dim">This kit has not been built yet.</p>;
  }

  if (error && !practice) {
    return (
      <p role="alert" className="text-sm text-bad">
        {error}
      </p>
    );
  }

  if (!practice) {
    return <div className="skeleton h-80 w-full" aria-busy="true" />;
  }

  const { progress } = practice;
  const attempted = progress.total === 0 ? 0 : progress.attempted / progress.total;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <div className="flex items-baseline justify-between gap-3">
          <p className="label">Day {day}</p>
          <p className="tnum text-xs text-faint">
            {progress.attempted} of {progress.total} seen · {progress.solid}{" "}
            solid · {progress.shaky} shaky
          </p>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-accent transition-[width]
              duration-500 ease-spring"
            style={{ width: `${Math.max(1, attempted * 100)}%` }}
          />
        </div>
      </div>

      {!current || !question ? (
        <section className="card p-10 text-center animate-scale-in">
          <h2 className="text-xl font-medium">Nothing due right now</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-dim">
            {progress.attempted === 0
              ? "This kit has not been practised yet. Come back when there is a plan for today."
              : "Everything scheduled for today has been through once. The next items come back on their own."}
          </p>
          <Link href={`/kits/${kitId}`} className="btn-ghost mt-6">
            Back to today
          </Link>
        </section>
      ) : (
        <section className="card p-8 animate-scale-in sm:p-10">
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip border-line text-faint">
              {question.category}
            </span>
            <span className="chip border-line text-faint">
              box {current.box}
            </span>
            {current.timesSeen > 0 && (
              <span className="chip border-line text-faint">
                seen {current.timesSeen}×
              </span>
            )}
          </div>

          <h2 className="mt-5 text-2xl font-medium leading-snug">
            {question.prompt}
          </h2>

          {revealed ? (
            <div className="mt-6 rounded-xl border border-line bg-void p-5 animate-fade-up">
              <p className="label">What a good answer covers</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-dim">
                {question.answer_outline}
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="btn-ghost mt-6 w-full justify-center py-4"
            >
              Say your answer out loud, then reveal
              <kbd className="kbd">space</kbd>
            </button>
          )}

          <div className="mt-8">
            <p className="label">How did that go?</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {CONFIDENCE.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={busy}
                  onClick={() => void rate(option.value)}
                  className={`flex flex-col items-center gap-0.5 rounded-xl
                    border bg-surface px-3 py-3 text-sm transition
                    disabled:opacity-40 ${TONE[option.tone]}`}
                >
                  <kbd className="kbd mb-1">{option.value}</kbd>
                  <span className="font-medium">{option.label}</span>
                  <span className="text-[10px] text-faint">{option.hint}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-bad">
          {error}
        </p>
      )}

      <p className="mt-6 text-center text-xs text-faint">
        <kbd className="kbd">space</kbd> reveal ·{" "}
        <kbd className="kbd">1</kbd>–<kbd className="kbd">5</kbd> grade ·{" "}
        <kbd className="kbd">t</kbd> back to today
      </p>
    </div>
  );
}
