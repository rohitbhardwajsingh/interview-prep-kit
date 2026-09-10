"use client";

import { Braces, MessageSquareQuote, Play } from "lucide-react";
import { CountUp } from "@/components/ui/count-up";
import { Ring } from "@/components/ui/ring";

/**
 * A faux app window for the hero.
 *
 * Marketing copy describes the product; this shows it. It is a static replica
 * of the real Today screen — the same readiness ring, countdown and
 * "do this next" — rather than a screenshot, so it stays crisp at any size and
 * animates its numbers into place the way the real thing does.
 */
export function ProductPreview() {
  return (
    <div className="relative">
      {/* Glow behind the window. */}
      <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-accent/20 blur-3xl" />

      <div className="overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-float">
        {/* Title bar. */}
        <div className="flex items-center gap-1.5 border-b border-line bg-surface-high px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-bad/70" />
          <span className="h-3 w-3 rounded-full bg-warn/70" />
          <span className="h-3 w-3 rounded-full bg-good/70" />
          <span className="ml-3 text-xs text-faint">Interview Prep Kit</span>
        </div>

        <div className="space-y-4 p-5">
          {/* Hero row: countdown + readiness. */}
          <div className="flex items-center justify-between gap-4 rounded-xl border border-line bg-gradient-to-br from-accent/10 to-cyan/5 p-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-faint">
                Your interview
              </p>
              <p className="mt-1 flex items-baseline gap-1.5">
                <span className="text-4xl font-light tabular-nums text-paper">
                  <CountUp value={4} />
                </span>
                <span className="text-sm text-dim">days</span>
              </p>
              <p className="mt-1 text-xs text-dim">Friday 18 September</p>
            </div>
            <Ring value={72} size={84} thickness={7}>
              <span className="text-lg font-semibold text-paper">
                <CountUp value={72} />
              </span>
            </Ring>
          </div>

          {/* Do this next. */}
          <div className="rounded-xl border border-accent/40 bg-accent-soft/40 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-accent">
              Do this next
            </p>
            <div className="mt-2 flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-grad text-white">
                <Play className="h-4 w-4 fill-current" />
              </span>
              <p className="text-sm font-medium text-paper">
                Answer 3 questions you have never tried
              </p>
            </div>
          </div>

          {/* A couple of colour-coded questions. */}
          <div className="space-y-2">
            {[
              { icon: Braces, label: "Technical", tone: "text-technical bg-technical/10" },
              {
                icon: MessageSquareQuote,
                label: "Behavioural",
                tone: "text-behavioural bg-behavioural/10",
              },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5"
              >
                <span className={`grid h-6 w-6 place-items-center rounded-md ${row.tone}`}>
                  <row.icon className="h-3.5 w-3.5" />
                </span>
                <span className="h-2 flex-1 rounded-full bg-line" />
                <span className="h-2 w-8 rounded-full bg-line-strong" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
