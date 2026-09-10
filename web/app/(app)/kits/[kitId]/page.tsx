"use client";

import Link from "next/link";
import { GenerationProgress } from "@/components/generation-progress";
import { useKitContext } from "@/components/kit-provider";
import { ReadinessPanel } from "@/components/readiness-panel";
import { formatCivilDate, formatMinutes, plural } from "@/lib/format";
import { useToday } from "@/lib/use-today";

export default function TodayPage() {
  const { kit, kitId, job, loading, error, regenerate } = useKitContext();
  const ready = kit?.status === "ready" && kit.kit !== null;
  const { today, loading: todayLoading } = useToday(kitId, ready);

  if (loading) return <TodaySkeleton />;

  if (error || !kit) {
    return (
      <p role="alert" className="text-sm text-bad">
        {error ?? "This kit could not be loaded"}
      </p>
    );
  }

  // A half-written kit is not something anyone should be reading, so while a
  // run is in flight the progress view is the whole screen.
  if (!ready) {
    const building = kit.status === "generating" || kit.status === "pending";
    return (
      <section className="card p-6">
        <h2 className="text-lg font-medium">
          {building ? "Building your kit" : "This kit has not been built yet"}
        </h2>
        <p className="mt-1 text-sm text-dim">
          {building
            ? "A minute or two. You can leave this page — it keeps going."
            : "Nothing was generated for this kit."}
        </p>

        <div className="mt-6">
          <GenerationProgress job={job} />
        </div>

        {!building && (
          <button
            type="button"
            className="btn-primary mt-6"
            onClick={() => void regenerate()}
          >
            {kit.status === "failed" ? "Try again" : "Build it"}
          </button>
        )}
      </section>
    );
  }

  if (todayLoading || !today) return <TodaySkeleton />;

  const { calendar, readiness, plan, questions, replan } = today;
  const done = calendar.isPast;

  return (
    <div className="stagger space-y-6">
      {/* The countdown comes first because it is the fact that reframes
          everything below it. */}
      <section
        className="card overflow-hidden p-6 sm:p-8"
        style={{ "--i": 0 } as React.CSSProperties}
      >
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="label">{done ? "Interview" : "Countdown"}</p>
            <h2 className="mt-2 text-display-sm font-light tracking-tight">
              {calendar.isInterviewDay ? (
                <span className="text-warn">Today</span>
              ) : done ? (
                <span className="text-dim">Done</span>
              ) : (
                <>
                  <span className="tnum">{calendar.daysUntilInterview}</span>
                  <span className="ml-2 text-2xl text-dim">
                    {calendar.daysUntilInterview === 1 ? "day" : "days"}
                  </span>
                </>
              )}
            </h2>
            <p className="mt-2 text-sm text-dim">
              {formatCivilDate(calendar.interviewDate)}
            </p>
          </div>

          {calendar.isInterviewDay && (
            <Link href={`/kits/${kitId}/panic`} className="btn-primary">
              Open the one-pager →
            </Link>
          )}
        </div>

        <DayStrip days={calendar.days} />
      </section>

      <section
        className="card p-6 sm:p-8"
        style={{ "--i": 1 } as React.CSSProperties}
      >
        <p className="label">How ready you are</p>
        <div className="mt-5">
          <ReadinessPanel readiness={readiness} />
        </div>
      </section>

      {/* One instruction, stated as an instruction. Everything else on this
          screen is context for it. */}
      <section
        className="card border-accent/30 p-6 sm:p-8"
        style={{ "--i": 2 } as React.CSSProperties}
      >
        <p className="label text-accent">Do this next</p>
        <h3 className="mt-2 text-xl font-medium">{readiness.nextAction}</h3>

        {plan && questions.length > 0 && (
          <>
            <p className="mt-4 text-sm text-dim">
              {plan.focus} · {plural(questions.length, "question")} ·{" "}
              {formatMinutes(plan.minutes)}
            </p>

            <ol className="mt-4 space-y-2">
              {questions.map((question, index) => (
                <li
                  key={question.id}
                  className="flex gap-3 rounded-xl border border-line
                    bg-surface px-4 py-3 text-sm"
                >
                  <span className="tnum shrink-0 text-faint">{index + 1}</span>
                  <span className="min-w-0 flex-1 text-paper">
                    {question.prompt}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-faint">
                    {question.id}
                  </span>
                </li>
              ))}
            </ol>
          </>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <Link href={`/kits/${kitId}/practice`} className="btn-primary">
            Start practising
            <kbd className="kbd border-white/30 bg-white/10 text-white">P</kbd>
          </Link>
          <Link href={`/kits/${kitId}/evidence`} className="btn-ghost">
            Check my stories
          </Link>
        </div>
      </section>

      {/* Only shown when it changes what the user should do. A replan notice
          on a plan nobody has fallen behind on is noise. */}
      {(today.behind || replan.overloaded ||
        replan.deferredQuestionIds.length > 0) && (
        <section
          className="card-quiet p-5"
          style={{ "--i": 3 } as React.CSSProperties}
        >
          <p className="label">Your plan was recut</p>
          <p className="mt-2 text-sm text-dim">{replan.summary}</p>
          {replan.overloaded && (
            <p className="mt-2 text-sm text-warn">
              There is more here than the days left comfortably hold. Consider
              what you are willing to walk in without.
            </p>
          )}
        </section>
      )}

      {readiness.blockers.length > 0 && (
        <section
          className="card-quiet p-5"
          style={{ "--i": 4 } as React.CSSProperties}
        >
          <p className="label">What is holding the score down</p>
          <ul className="mt-3 space-y-1.5">
            {readiness.blockers.map((blocker) => (
              <li key={blocker} className="flex gap-2 text-sm text-dim">
                <span aria-hidden="true" className="text-faint">
                  ·
                </span>
                {blocker}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * The whole plan as a row of dots, so progress through the week is legible
 * without reading a list. Past days are dimmed rather than hidden: seeing
 * what you missed is the point.
 */
function DayStrip({
  days,
}: {
  days: { day: number; date: string; weekday: string; state: string }[];
}) {
  if (days.length === 0) return null;

  return (
    <ol className="mt-8 flex flex-wrap gap-1.5">
      {days.map((day) => (
        <li
          key={day.day}
          title={`${day.weekday} ${day.date}`}
          className={`flex h-9 min-w-9 items-center justify-center rounded-lg
            border px-2 text-xs transition ${
              day.state === "today"
                ? "border-accent bg-accent-soft text-paper"
                : day.state === "past"
                  ? "border-line bg-surface text-faint"
                  : "border-line text-dim"
            }`}
        >
          {day.weekday.slice(0, 3)}
        </li>
      ))}
    </ol>
  );
}

function TodaySkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-48 w-full" />
      <div className="skeleton h-56 w-full" />
      <div className="skeleton h-40 w-full" />
    </div>
  );
}
