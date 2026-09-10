"use client";

import {
  describeProgress,
  expectedStepsFor,
  extraSteps,
  type DisplayStep,
} from "@/lib/steps";
import type { Job } from "@/lib/types";

const ICONS: Record<DisplayStep["state"], string> = {
  ok: "✓",
  failed: "✕",
  skipped: "!",
  running: "",
  waiting: "",
};

const TONE: Record<DisplayStep["state"], string> = {
  ok: "text-good border-good/40 bg-good/10",
  failed: "text-bad border-bad/40 bg-bad/10",
  skipped: "text-warn border-warn/40 bg-warn/10",
  running: "text-edited border-edited bg-edited/10",
  waiting: "text-dim border-line bg-void",
};

function seconds(ms: number): string {
  if (ms === 0) return "";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function GenerationProgress({ job }: { job: Job | null }) {
  const expected = expectedStepsFor(job);
  const steps = describeProgress(job?.steps ?? [], job?.status ?? null, expected);
  const notes = extraSteps(job?.steps ?? [], expected);

  return (
    <div className="space-y-6">
      <ol className="space-y-1">
        {steps.map((step) => (
          <li
            key={step.id}
            className="flex items-start gap-3 rounded-lg px-2 py-2"
          >
            <span
              aria-hidden
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center
                rounded-full border text-xs font-semibold ${TONE[step.state]}`}
            >
              {step.state === "running" ? (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-edited" />
              ) : (
                ICONS[step.state]
              )}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <p
                  className={`text-sm font-medium ${
                    step.state === "waiting" ? "text-dim" : "text-paper"
                  }`}
                >
                  {step.label}
                </p>
                <span className="shrink-0 font-mono text-[11px] text-dim">
                  {seconds(step.durationMs)}
                </span>
              </div>

              {/* The detail is the pipeline's own words, so progress reports
                  what actually happened rather than a generic reassurance. */}
              <p className="mt-0.5 truncate text-xs text-dim">
                {step.detail || step.hint}
              </p>
            </div>
          </li>
        ))}
      </ol>

      {notes.length > 0 && (
        <div className="card p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-dim">
            Notes from this run
          </p>
          <ul className="space-y-1.5">
            {notes.map((note, index) => (
              <li key={`${note.step}-${index}`} className="text-xs text-warn">
                {note.detail || note.step}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* A superseded run is not a fault: the guard did its job and kept the
          user's edit, so it reads as an outcome rather than a breakage. */}
      {job?.status === "failed" && job.error?.code === "SUPERSEDED" && (
        <div className="rounded-lg border border-warn/40 bg-warn/10 p-3">
          <p className="text-sm font-medium text-warn">Your edit won</p>
          <p className="mt-1 text-xs text-dim">{job.error.message}</p>
        </div>
      )}

      {job?.status === "failed" && job.error && job.error.code !== "SUPERSEDED" && (
        <div
          role="alert"
          className="rounded-lg border border-bad/40 bg-bad/10 p-3"
        >
          <p className="text-sm font-medium text-bad">
            This run stopped early
          </p>
          <p className="mt-1 text-xs text-dim">{job.error.message}</p>
          <p className="mt-2 text-xs text-dim">
            Nothing you had before was changed. You can try again.
          </p>
        </div>
      )}
    </div>
  );
}
