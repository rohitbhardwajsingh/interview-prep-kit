"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useKitContext } from "@/components/kit-provider";
import { api, ApiError } from "@/lib/api";
import type { Calibration } from "@/lib/types";

/**
 * Whether the candidate's instincts about their own answers can be trusted.
 *
 * The number this page exists for is not a score. It is the difference
 * between two scores: what the candidate predicted before seeing any
 * measurement, and what the measurement found. That difference is the only
 * thing in the product that can tell someone their preparation is fine but
 * their judgement of it is not — which is the failure mode that produces a
 * confident candidate and a rejection email.
 *
 * Deliberately quiet when there is nothing to say. Three answered questions
 * is the floor for a verdict, and inventing one earlier would teach people
 * to distrust the whole thing.
 */

const VERDICTS: Record<
  Calibration["verdict"],
  { label: string; tone: string; ring: string }
> = {
  overconfident: {
    label: "Overconfident",
    tone: "text-warn",
    ring: "border-warn/30 bg-warn/5",
  },
  underconfident: {
    label: "Harder on yourself than the evidence",
    tone: "text-edited",
    ring: "border-edited/30 bg-edited/5",
  },
  calibrated: {
    label: "Well calibrated",
    tone: "text-good",
    ring: "border-good/30 bg-good/5",
  },
  unknown: {
    label: "Not enough to say yet",
    tone: "text-dim",
    ring: "border-line bg-surface",
  },
};

/**
 * Two bars, claimed above measured, sharing one scale.
 *
 * A single "gap: 40" number is arithmetic nobody feels. Seeing the shorter
 * bar sit under the longer one is the same fact arriving as a picture, and
 * it is the picture people remember when they next rate an answer.
 */
function GapBars({ claimed, measured }: { claimed: number; measured: number }) {
  const rows = [
    { label: "You thought", value: claimed, colour: "bg-faint" },
    {
      label: "You said",
      value: measured,
      colour: measured < claimed ? "bg-warn" : "bg-good",
    },
  ];

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-dim">{row.label}</span>
            <span className="tnum text-paper">{row.value}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-line">
            <div
              className={`h-full rounded-full transition-[width] duration-700 ease-spring ${row.colour}`}
              style={{ width: `${Math.max(2, row.value)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CalibrationPage() {
  const { kit, kitId } = useKitContext();
  const ready = kit?.status === "ready" && kit.kit !== null;

  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();

    api<{ calibration: Calibration }>(`/kits/${kitId}/calibration`, {
      signal: controller.signal,
    })
      .then((body) => setCalibration(body.calibration))
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof ApiError ? cause.message : "Could not load");
      });

    return () => controller.abort();
  }, [kitId, ready]);

  if (!ready) {
    return <p className="text-sm text-dim">This kit has not been built yet.</p>;
  }

  if (error) {
    return (
      <p role="alert" className="text-sm text-bad">
        {error}
      </p>
    );
  }

  if (!calibration) {
    return <div className="skeleton h-64 w-full" aria-busy="true" />;
  }

  const verdict = VERDICTS[calibration.verdict];
  const started = calibration.attempts > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className={`card animate-scale-in space-y-5 p-6 ${verdict.ring}`}>
        <div>
          <p className="label">Self-assessment</p>
          <h2 className={`mt-1.5 text-2xl font-medium ${verdict.tone}`}>
            {verdict.label}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-dim">
            {calibration.summary}
          </p>
        </div>

        {started && (
          <GapBars
            claimed={calibration.averageClaimed}
            measured={calibration.averageMeasured}
          />
        )}

        {!started && (
          <Link href={`/kits/${kitId}/practice`} className="btn-primary">
            Answer one out loud
          </Link>
        )}
      </div>

      {calibration.blindSpots.length > 0 && (
        <section className="space-y-3">
          <div>
            <h3 className="font-medium">Blind spots</h3>
            <p className="mt-1 text-sm text-dim">
              Questions you rated well above what the answer actually
              contained. These are the ones you would not think to revise.
            </p>
          </div>

          <ul className="stagger space-y-2">
            {calibration.blindSpots.map((spot, index) => (
              <li
                key={spot.questionId}
                style={{ "--i": Math.min(index, 8) } as React.CSSProperties}
              >
                <Link
                  href={`/kits/${kitId}/questions?q=${encodeURIComponent(spot.prompt.slice(0, 24))}`}
                  className="card-interactive flex items-center gap-4 p-4"
                >
                  {/* The gap leads, because it is the reason this row is
                      here at all. */}
                  <div className="w-12 shrink-0 text-center">
                    <div className="tnum text-2xl font-light leading-none text-warn">
                      {spot.gap}
                    </div>
                    <div className="label mt-1">gap</div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{spot.prompt}</p>
                    <p className="mt-0.5 text-xs text-dim">
                      You said {spot.selfRating} of 5 · it measured{" "}
                      {spot.measuredScore} of 100 · {spot.category}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {calibration.byCategory.length > 1 && (
        <section className="card space-y-3 p-5">
          <p className="label">By category</p>
          <ul className="space-y-2.5">
            {calibration.byCategory.map((entry) => (
              <li key={entry.category} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-sm capitalize text-dim">
                  {entry.category}
                </span>

                {/* Centred on zero, so over- and under-estimation lean in
                    opposite directions rather than both growing rightwards. */}
                <div className="relative h-2 flex-1 rounded-full bg-line">
                  <span className="absolute left-1/2 top-[-3px] h-3 w-px bg-line-strong" />
                  <div
                    className={`absolute top-0 h-2 rounded-full transition-all duration-700 ease-spring ${
                      entry.averageGap > 0 ? "bg-warn" : "bg-good"
                    }`}
                    style={{
                      left: entry.averageGap > 0 ? "50%" : undefined,
                      right: entry.averageGap > 0 ? undefined : "50%",
                      width: `${Math.min(50, Math.abs(entry.averageGap) / 2)}%`,
                    }}
                  />
                </div>

                <span className="tnum w-12 shrink-0 text-right text-xs text-dim">
                  {entry.averageGap > 0 ? "+" : ""}
                  {entry.averageGap}
                </span>
              </li>
            ))}
          </ul>
          <p className="pt-1 text-xs text-faint">
            Positive means answers in that category come out weaker than they
            feel.
          </p>
        </section>
      )}
    </div>
  );
}
