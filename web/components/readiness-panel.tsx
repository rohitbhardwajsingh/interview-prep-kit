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
 * The score, and immediately underneath it, why.
 *
 * A single number is only useful if you can argue with it, so the parts that
 * produced it are never more than a glance away. The ceiling is shown
 * separately from the components because it is a different kind of fact: not
 * something the user failed to do, but something the kit cannot ask them.
 */
export function ReadinessPanel({ readiness }: { readiness: Readiness }) {
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

      <div className="w-full min-w-0 flex-1 space-y-3">
        {readiness.components.map((component) => (
          <div key={component.id}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-paper">{component.label}</span>
              <span className="tnum text-xs text-faint">
                {Math.round(component.score * 100)}%
                <span className="ml-1.5 text-faint/70">
                  ({Math.round(component.weight * 100)}% of the score)
                </span>
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

            <p className="mt-1 text-xs text-faint">{component.detail}</p>
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
