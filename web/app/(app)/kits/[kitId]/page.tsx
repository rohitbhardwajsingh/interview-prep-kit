"use client";

import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  CalendarClock,
  ChevronRight,
  Mic,
  Play,
  TriangleAlert,
} from "lucide-react";
import { GenerationProgress } from "@/components/generation-progress";
import { useKitContext } from "@/components/kit-provider";
import { ReadinessPanel } from "@/components/readiness-panel";
import { TimeBudget } from "@/components/time-budget";
import { CountUp } from "@/components/ui/count-up";
import { categoryMeta } from "@/lib/categories";
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
    <div className="stagger space-y-5">
      {/* Countdown and readiness together, because they are the two facts that
          frame everything else: how long you have, and how ready you are. */}
      <section
        className="card overflow-hidden bg-hero-grad p-6 sm:p-8"
        style={{ "--i": 0 } as React.CSSProperties}
      >
        <div className="flex flex-col items-center gap-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-center sm:text-left">
            <p className="label flex items-center justify-center gap-1.5 sm:justify-start">
              <CalendarClock className="h-3.5 w-3.5" />
              {done ? "Interview" : "Your interview"}
            </p>
            <h2 className="mt-3 font-light tracking-tight">
              {calendar.isInterviewDay ? (
                <span className="text-display-sm text-warn">Today</span>
              ) : done ? (
                <span className="text-display-sm text-dim">Done</span>
              ) : (
                <span className="flex items-baseline justify-center gap-2 sm:justify-start">
                  <span className="text-display-lg tnum text-paper">
                    <CountUp value={calendar.daysUntilInterview} />
                  </span>
                  <span className="text-2xl text-dim">
                    {calendar.daysUntilInterview === 1 ? "day" : "days"}
                  </span>
                </span>
              )}
            </h2>
            <p className="mt-2 text-sm font-medium text-dim">
              {formatCivilDate(calendar.interviewDate)}
            </p>

            {calendar.isInterviewDay && (
              <Link
                href={`/kits/${kitId}/panic`}
                className="btn-primary mt-4"
              >
                Open the one-pager
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>

          <div className="shrink-0">
            <ReadinessPanel readiness={readiness} compact />
          </div>
        </div>

        <DayStrip days={calendar.days} />
      </section>

      {/* One instruction, made the most tappable thing on the screen. */}
      <Link
        href={`/kits/${kitId}/practice`}
        className="card-interactive group block border-accent/40 bg-accent-soft/40
          p-6 sm:p-7"
        style={{ "--i": 1 } as React.CSSProperties}
      >
        <div className="flex items-center gap-4">
          <span
            className="grid h-12 w-12 shrink-0 place-items-center rounded-xl
              bg-accent-grad text-white shadow-glow transition
              group-hover:scale-105"
          >
            <Play className="h-5 w-5 fill-current" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="label text-accent">Do this next</p>
            <h3 className="mt-1 text-xl font-semibold leading-tight text-paper">
              {readiness.nextAction}
            </h3>
          </div>
          <ChevronRight
            className="h-6 w-6 shrink-0 text-faint transition
              group-hover:translate-x-1 group-hover:text-paper"
          />
        </div>

        {plan && questions.length > 0 && (
          <div className="mt-5 border-t border-line/60 pt-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="chip border-line bg-surface-high text-dim">
                {plan.focus}
              </span>
              <span className="chip border-line bg-surface-high text-dim">
                {plural(questions.length, "question")}
              </span>
              <span className="chip border-line bg-surface-high text-dim">
                {formatMinutes(plan.minutes)}
              </span>
            </div>

            <ol className="space-y-1.5">
              {questions.map((question, index) => {
                const meta = categoryMeta(question.category);
                return (
                  <li
                    key={question.id}
                    className="flex items-center gap-3 rounded-xl border
                      border-line bg-surface/80 px-4 py-2.5 text-sm transition
                      group-hover:border-line-strong"
                  >
                    <span
                      className={`grid h-6 w-6 shrink-0 place-items-center
                        rounded-lg ${meta.bgSoft} ${meta.text}`}
                    >
                      <meta.icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-paper">
                      {question.prompt}
                    </span>
                    <span className="tnum shrink-0 text-xs text-faint">
                      {index + 1}/{questions.length}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </Link>

      {/* The other ways in, as big obvious targets rather than a row of text
          links buried under a paragraph. */}
      <div
        className="grid grid-cols-2 gap-3 sm:grid-cols-3"
        style={{ "--i": 2 } as React.CSSProperties}
      >
        <ActionTile
          href={`/kits/${kitId}/practice`}
          icon={<Play className="h-5 w-5" />}
          label="Practise"
          hint="Spaced repetition"
          accent="text-accent"
          shortcut="P"
        />
        <ActionTile
          href={`/kits/${kitId}/mock`}
          icon={<Mic className="h-5 w-5" />}
          label="Mock interview"
          hint="Answer out loud"
          accent="text-cyan"
          shortcut="M"
        />
        <ActionTile
          href={`/kits/${kitId}/evidence`}
          icon={<BookOpenCheck className="h-5 w-5" />}
          label="My stories"
          hint="Cover the gaps"
          accent="text-good"
          shortcut="E"
        />
      </div>

      {/* Sits directly under the plan, because the honest reason people skip a
          plan is not disagreement with it but not having the hour it assumes. */}
      <div style={{ "--i": 3 } as React.CSSProperties}>
        <TimeBudget kitId={kitId} />
      </div>

      {/* Only shown when it changes what the user should do. */}
      {(today.behind ||
        replan.overloaded ||
        replan.deferredQuestionIds.length > 0) && (
        <section
          className="card-quiet border-warn/30 bg-warn/5 p-5"
          style={{ "--i": 4 } as React.CSSProperties}
        >
          <p className="label flex items-center gap-1.5 text-warn">
            <TriangleAlert className="h-3.5 w-3.5" />
            Your plan was recut
          </p>
          <p className="mt-2 text-sm text-dim">{replan.summary}</p>
        </section>
      )}

      {readiness.blockers.length > 0 && (
        <section
          className="card-quiet p-5"
          style={{ "--i": 5 } as React.CSSProperties}
        >
          <p className="label">What is holding the score down</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {readiness.blockers.map((blocker) => (
              <li
                key={blocker}
                className="flex items-center gap-2.5 rounded-lg border
                  border-line bg-surface px-3 py-2 text-sm text-dim"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-bad" />
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
 * A big, unmistakably-tappable choice. Icons and colour do the work a
 * paragraph used to, so the eye lands on the verb and nothing else.
 */
function ActionTile({
  href,
  icon,
  label,
  hint,
  accent,
  shortcut,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  hint: string;
  accent: string;
  shortcut: string;
}) {
  return (
    <Link href={href} className="tile group">
      <span className={`flex items-center justify-between ${accent}`}>
        {icon}
        <kbd className="kbd opacity-0 transition group-hover:opacity-100">
          {shortcut}
        </kbd>
      </span>
      <span>
        <span className="block font-semibold text-paper">{label}</span>
        <span className="block text-xs text-faint">{hint}</span>
      </span>
    </Link>
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
            border px-2 text-xs font-medium transition ${
              day.state === "today"
                ? "border-accent bg-accent-grad text-white shadow-glow"
                : day.state === "past"
                  ? "border-line bg-surface text-faint line-through decoration-faint/50"
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
