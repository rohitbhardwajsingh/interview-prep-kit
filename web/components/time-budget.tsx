"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";

/**
 * "I have ten minutes."
 *
 * The plan already knows what a whole day of preparation looks like, which
 * is exactly the wrong answer to give someone on a train. Shown a day's
 * worth of work by someone with a spare quarter of an hour, most people do
 * none of it — so this asks how long they have and names the two or three
 * things that fit, each with the reason it earned its place.
 *
 * The reasons are load-bearing. A bare list gets reordered by whoever reads
 * it, usually towards whatever feels most comfortable, which is the opposite
 * of what triage chose it for.
 */

interface TriageAction {
  questionId: string;
  prompt: string;
  category: string;
  kind: "answer" | "review";
  minutes: number;
  reason: string;
}

interface TriageBody {
  actions: TriageAction[];
  minutesUsed: number;
  deferred: number;
  summary: string;
}

/** Real amounts of time people actually have, not a slider. */
const BUDGETS = [5, 10, 25, 60] as const;

const KIND_LABEL: Record<TriageAction["kind"], string> = {
  answer: "Out loud",
  review: "Review",
};

export function TimeBudget({ kitId }: { kitId: string }) {
  const [minutes, setMinutes] = useState<number>(10);
  const [body, setBody] = useState<TriageBody | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setBody(null);

    api<TriageBody>(`/kits/${kitId}/triage?minutes=${minutes}`, {
      signal: controller.signal,
    })
      .then(setBody)
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof ApiError ? cause.message : "Could not load");
      });

    return () => controller.abort();
  }, [kitId, minutes]);

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label">If you only have</p>
          <h3 className="mt-1 text-lg font-medium">a few minutes</h3>
        </div>

        <div
          role="group"
          aria-label="Time available"
          className="flex gap-1 rounded-xl border border-line bg-void p-1"
        >
          {BUDGETS.map((budget) => (
            <button
              key={budget}
              type="button"
              aria-pressed={minutes === budget}
              onClick={() => setMinutes(budget)}
              className={`tnum rounded-lg px-3 py-1.5 text-xs transition ${
                minutes === budget
                  ? "bg-surface-high text-paper"
                  : "text-dim hover:text-paper"
              }`}
            >
              {budget}m
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-bad">
          {error}
        </p>
      )}

      {!body && !error && (
        <div className="mt-4 space-y-2" aria-busy="true">
          <div className="skeleton h-14 w-full" />
          <div className="skeleton h-14 w-full" />
        </div>
      )}

      {body && (
        <>
          <p className="mt-3 text-sm text-dim">{body.summary}</p>

          {body.actions.length > 0 && (
            <ol className="stagger mt-4 space-y-2">
              {body.actions.map((action, index) => (
                <li
                  key={action.questionId}
                  style={{ "--i": index } as React.CSSProperties}
                >
                  <Link
                    href={
                      action.kind === "answer"
                        ? `/kits/${kitId}/practice`
                        : `/kits/${kitId}/questions?q=${encodeURIComponent(action.prompt.slice(0, 24))}`
                    }
                    className="card-interactive block p-3.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 flex-1 text-sm leading-snug">
                        {action.prompt}
                      </p>
                      <span className="tnum shrink-0 text-xs text-faint">
                        {action.minutes}m
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span
                        className={`chip ${
                          action.kind === "answer"
                            ? "border-accent/40 text-accent"
                            : "border-line text-faint"
                        }`}
                      >
                        {KIND_LABEL[action.kind]}
                      </span>
                      {/* The justification, which is the point. */}
                      <span className="min-w-0 flex-1 truncate text-xs text-dim">
                        {action.reason}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          )}

          {body.deferred > 0 && (
            <p className="mt-3 text-xs text-faint">
              {body.deferred} more {body.deferred === 1 ? "question" : "questions"}{" "}
              would not fit.
            </p>
          )}
        </>
      )}
    </section>
  );
}
