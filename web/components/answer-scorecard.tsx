"use client";

import { useState } from "react";
import { CountUp } from "@/components/ui/count-up";
import { Ring, readinessColour } from "@/components/ui/ring";
import type { Attempt } from "@/lib/types";

/**
 * What the answer actually contained, after it has been given.
 *
 * Ordered by what changes behaviour rather than by what is easy to render.
 * The gap against the candidate's own prediction leads, because a surprise
 * is the only thing here that makes someone re-practise a question they had
 * already ticked off. The score follows. The itemised outline is last: it is
 * the evidence for the verdict, and evidence is what you read when you want
 * to argue with a claim, not the claim itself.
 *
 * Every number on this screen is traceable to words the candidate said. The
 * model's opinion is shown separately and labelled as an opinion, so the two
 * are never confused.
 */

const SUBSTANCE: Record<
  NonNullable<Attempt["judgement"]>["substance"],
  { label: string; tone: string }
> = {
  strong: { label: "Had substance", tone: "border-good/30 bg-good/10 text-good" },
  thin: {
    label: "Right words, thin underneath",
    tone: "border-warn/30 bg-warn/10 text-warn",
  },
  "off-target": {
    label: "Answered a different question",
    tone: "border-bad/30 bg-bad/10 text-bad",
  },
};

function Stat({
  label,
  value,
  tone = "text-paper",
  hint,
}: {
  label: string;
  value: string;
  tone?: string;
  hint?: string;
}) {
  return (
    <div className="card-quiet p-3" title={hint}>
      <p className="label">{label}</p>
      <p className={`tnum mt-1 text-lg font-light ${tone}`}>{value}</p>
    </div>
  );
}

interface Props {
  attempt: Attempt;
  /** Absent when no model was configured or it could not be reached. */
  judgeError?: string | null;
  /** Given when the model wrote a follow-up worth actually answering. */
  onDrill?: (followUp: string) => void;
  footer?: React.ReactNode;
}

export function AnswerScorecard({ attempt, judgeError, onDrill, footer }: Props) {
  const [showTranscript, setShowTranscript] = useState(false);
  const { analysis, judgement, prediction } = attempt;
  const { gap, surprising } = prediction;

  const missed = analysis.points.filter((point) => !point.covered);
  const { pacing } = analysis;

  return (
    <div className="stagger space-y-5">
      {/* The headline is the gap, not the score: a 60 that felt like a 90 is
          a different piece of news from a 60 that felt like a 60. */}
      <div
        style={{ "--i": 0 } as React.CSSProperties}
        className="card flex items-center gap-6 p-6"
      >
        <Ring value={analysis.score} size={92} />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span
              className="tnum text-display-sm font-light"
              style={{ color: readinessColour(analysis.score) }}
            >
              <CountUp value={analysis.score} />
            </span>
            <span className="text-sm text-faint">out of 100</span>
          </div>

          <p className="mt-2 text-sm text-dim">
            {surprising ? (
              gap > 0 ? (
                <>
                  You felt that was a{" "}
                  <span className="text-paper">{attempt.selfRating}</span>. It
                  measured{" "}
                  <span className="text-warn">{gap} points weaker</span> — this
                  is a question to come back to.
                </>
              ) : (
                <>
                  That was{" "}
                  <span className="text-good">
                    {Math.abs(gap)} points better
                  </span>{" "}
                  than it felt. You know this one.
                </>
              )
            ) : (
              <>Your read on that was about right.</>
            )}
          </p>
        </div>
      </div>

      {judgement && (
        <div
          style={{ "--i": 1 } as React.CSSProperties}
          className="card space-y-4 p-5"
        >
          <div className="flex items-center justify-between gap-3">
            <span className={`chip ${SUBSTANCE[judgement.substance].tone}`}>
              {SUBSTANCE[judgement.substance].label}
            </span>
            <span className="label">Reviewer</span>
          </div>

          <p className="text-[15px] leading-relaxed">{judgement.verdict}</p>

          <div className="grid gap-3 sm:grid-cols-2">
            {judgement.strongest && (
              <div className="rounded-xl border border-good/20 bg-good/5 p-3">
                <p className="label text-good">What landed</p>
                <p className="mt-1 text-sm text-dim">{judgement.strongest}</p>
              </div>
            )}
            {judgement.gap && (
              <div className="rounded-xl border border-warn/20 bg-warn/5 p-3">
                <p className="label text-warn">What cost the most</p>
                <p className="mt-1 text-sm text-dim">{judgement.gap}</p>
              </div>
            )}
          </div>

          {judgement.cut && (
            <p className="text-sm text-dim">
              <span className="label mr-2">Cut</span>
              {judgement.cut}
            </p>
          )}

          {/* The follow-up is offered as an action rather than as text,
              because reading the question you would be asked next is a
              fraction as useful as being asked it. */}
          {judgement.follow_up && (
            <div className="rounded-xl border border-accent/30 bg-accent-soft p-4">
              <p className="label text-accent">They would ask next</p>
              <p className="mt-1.5 text-[15px] leading-relaxed">
                {judgement.follow_up}
              </p>
              {onDrill && (
                <button
                  type="button"
                  className="btn-ghost mt-3 text-xs"
                  onClick={() => onDrill(judgement.follow_up)}
                >
                  Answer that too
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {judgeError && (
        <p
          style={{ "--i": 1 } as React.CSSProperties}
          className="rounded-xl border border-line bg-surface px-4 py-3 text-xs text-dim"
        >
          The reviewer could not be reached, so only the measurements are here.
          They are the part that does not depend on a network.
        </p>
      )}

      <div
        style={{ "--i": 2 } as React.CSSProperties}
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <Stat
          label="Outline"
          value={`${analysis.points.length - missed.length}/${analysis.points.length}`}
          tone={missed.length === 0 ? "text-good" : "text-warn"}
          hint="Points from the answer outline you actually reached."
        />
        <Stat
          label="Specifics"
          value={String(analysis.specifics.length)}
          tone={analysis.specifics.length === 0 ? "text-bad" : "text-good"}
          hint="Figures, durations and named systems. Two is enough to stop sounding generic."
        />
        <Stat
          label={pacing.spokenSeconds === null ? "Words" : "Length"}
          value={
            pacing.spokenSeconds === null
              ? String(pacing.wordCount)
              : `${pacing.spokenSeconds}s`
          }
          tone={
            pacing.verdict === "good"
              ? "text-good"
              : pacing.verdict === "unknown"
                ? "text-dim"
                : "text-warn"
          }
          hint={`A good answer here runs ${pacing.targetSeconds[0]}–${pacing.targetSeconds[1]} seconds.`}
        />
        <Stat
          label="Filler"
          value={`${analysis.fillerRatePer100}%`}
          tone={analysis.fillerRatePer100 > 5 ? "text-warn" : "text-good"}
          hint="Share of words that were padding. Under 5% is unnoticeable."
        />
      </div>

      {analysis.notes.length > 0 && (
        <ul
          style={{ "--i": 3 } as React.CSSProperties}
          className="card space-y-2.5 p-5"
        >
          {analysis.notes.map((note) => (
            <li key={note} className="flex gap-3 text-sm text-dim">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-faint" />
              {note}
            </li>
          ))}
        </ul>
      )}

      <div
        style={{ "--i": 4 } as React.CSSProperties}
        className="card space-y-3 p-5"
      >
        <p className="label">The outline, point by point</p>
        <ul className="space-y-2">
          {analysis.points.map((point) => (
            <li key={point.text} className="flex gap-3 text-sm">
              <span
                aria-hidden
                className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] ${
                  point.covered
                    ? "bg-good/15 text-good"
                    : "bg-bad/15 text-bad"
                }`}
              >
                {point.covered ? "✓" : "○"}
              </span>
              <span className={point.covered ? "text-dim" : "text-paper"}>
                {point.text}
                {/* The words that decided it, so the verdict is arguable
                    rather than oracular. */}
                {point.covered && point.matched.length > 0 && (
                  <span className="ml-2 text-xs text-faint">
                    heard: {point.matched.slice(0, 4).join(", ")}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div style={{ "--i": 5 } as React.CSSProperties} className="space-y-3">
        <button
          type="button"
          className="btn-bare text-xs"
          onClick={() => setShowTranscript((shown) => !shown)}
        >
          {showTranscript ? "Hide" : "Show"} what you actually said
        </button>

        {showTranscript && (
          <p className="animate-fade-in rounded-xl border border-line bg-void p-4 text-sm leading-relaxed text-dim">
            {attempt.transcript}
          </p>
        )}
      </div>

      {footer}
    </div>
  );
}
