"use client";

import { useEffect } from "react";

/**
 * The gate between giving an answer and seeing it scored.
 *
 * Its whole reason for existing is ordering. Ask "how did that go?" after
 * showing a score and the answer is just the score read back; ask it before
 * and it is a prediction that can be wrong — which is the only version of
 * the question worth asking, because the gap between the two is what tells
 * a candidate which answers they cannot trust their own instincts about.
 *
 * So this deliberately shows nothing: no coverage, no transcript, no hint.
 * It is one screen of five buttons and it is the most load-bearing screen in
 * the product.
 */

/**
 * Worded as predictions about the interviewer, not feelings about the answer.
 * "Good" invites a polite 4 from everyone; "they would move on satisfied" is
 * a claim a person can notice themselves overstating.
 */
const RATINGS = [
  { value: 1, label: "Lost it", detail: "I did not really answer the question" },
  { value: 2, label: "Rough", detail: "They would have doubts" },
  { value: 3, label: "Passable", detail: "They would probe further" },
  { value: 4, label: "Solid", detail: "They would move on satisfied" },
  { value: 5, label: "Nailed it", detail: "That is my best version of this" },
] as const;

interface Props {
  onRate(rating: number): void;
  busy?: boolean;
}

export function SelfRating({ onRate, busy = false }: Props) {
  // Number keys, so the prediction costs one keystroke and the candidate
  // answers on instinct rather than deliberating over a mouse target.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (busy) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const value = Number(event.key);
      if (Number.isInteger(value) && value >= 1 && value <= 5) {
        event.preventDefault();
        onRate(value);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onRate, busy]);

  return (
    <div className="animate-fade-up space-y-6">
      <div className="space-y-1.5">
        <h2 className="text-xl font-medium">Before you see the score</h2>
        <p className="text-sm text-dim">
          How would that answer have landed? Guess honestly — the gap between
          this and the measurement is the useful part.
        </p>
      </div>

      <div className="stagger space-y-2">
        {RATINGS.map((rating, index) => (
          <button
            key={rating.value}
            type="button"
            disabled={busy}
            onClick={() => onRate(rating.value)}
            style={{ "--i": index } as React.CSSProperties}
            className="card-interactive flex w-full items-center gap-4 p-4 text-left disabled:opacity-40"
          >
            <kbd className="kbd h-7 w-7 text-xs">{rating.value}</kbd>
            <div className="min-w-0">
              <p className="font-medium">{rating.label}</p>
              <p className="mt-0.5 text-xs text-dim">{rating.detail}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
