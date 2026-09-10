"use client";

import { CountUp } from "@/components/ui/count-up";
import { readinessColour, Ring } from "@/components/ui/ring";
import type { Readiness } from "@/lib/types";

const BAND_LABEL: Record<Readiness["band"], string> = {
  "not-started": "Not started",
  early: "Early days",
  "getting-there": "Getting there",
  ready: "Ready",
};

/**
 * The readiness score, with just enough of its makeup to be believed.
 *
 * Two modes. `compact` is for the hero: the ring, the band, and a slim bar per
 * component — a glance, no prose. The full mode adds the one-line reason under
 * each bar and the ceiling warning, for the person who wants to argue with the
 * number. Neither rounds anything up to be kind.
 */
export function ReadinessPanel({
  readiness,
  compact = false,
}: {
  readiness: Readiness;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="flex flex-col items-center gap-4">
        <Ring value={readiness.score} size={148} thickness={10}>
          <div className="text-center">
            <div className="text-display-sm font-light leading-none text-paper">
              <CountUp value={readiness.score} />
            </div>
            <div
              className="mt-1 text-[11px] font-semibold uppercase tracking-wide"
              style={{ color: readinessColour(readiness.score) }}
            >
              {BAND_LABEL[readiness.band]}
            </div>
          </div>
        </Ring>

        <div className="flex w-full max-w-[220px] flex-col gap-2">
          {readiness.components.map((component) => (
            <div key={component.id} className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-[11px] text-faint">
                {component.label}
              </span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full transition-[width] duration-700
                    ease-spring"
                  style={{
                    width: `${Math.max(3, component.score * 100)}%`,
                    background: readinessColour(component.score * 100),
                  }}
                />
              </div>
              <span className="tnum w-8 shrink-0 text-right text-[11px] text-dim">
                {Math.round(component.score * 100)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
      <Ring value={readiness.score} size={168} thickness={9}>
        <div className="text-center">
          <div className="text-display-sm font-light text-paper">
            <CountUp value={readiness.score} />
          </div>
          <div className="label mt-1">{BAND_LABEL[readiness.band]}</div>
        </div>
      </Ring>

      <div className="w-full min-w-0 max-w-lg flex-1 space-y-3">
        {readiness.components.map((component) => (
          <div key={component.id}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium text-paper">{component.label}</span>
              <span className="tnum text-xs text-dim">
                {Math.round(component.score * 100)}%
                {readiness.components.length > 1 && (
                  <span className="ml-1.5 text-faint">
                    ({Math.round(component.weight * 100)}% of the score)
                  </span>
                )}
              </span>
            </div>

            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full transition-[width] duration-700
                  ease-spring"
                style={{
                  width: `${Math.max(2, component.score * 100)}%`,
                  background: readinessColour(component.score * 100),
                }}
              />
            </div>

            <p className="mt-1 text-xs text-dim">{component.detail}</p>
          </div>
        ))}

        {readiness.ceiling.score < 1 && (
          <p
            className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2
              text-xs text-warn"
          >
            {readiness.ceiling.detail}. Until that is fixed this score cannot
            pass {Math.round(readiness.ceiling.score * 100)}.
          </p>
        )}
      </div>
    </div>
  );
}
