"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarClock,
  CircleCheck,
  Flame,
  ListChecks,
  Plus,
  Sparkles,
  Target,
} from "lucide-react";
import { useSession } from "@/components/session";
import { CountUp } from "@/components/ui/count-up";
import { readinessColour, Ring } from "@/components/ui/ring";
import { api, ApiError } from "@/lib/api";
import { formatCivilDate, greeting, nameFromEmail, plural } from "@/lib/format";
import type { KitSummary } from "@/lib/types";

const STATUS_TONE: Record<KitSummary["status"], string> = {
  pending: "border-line text-dim",
  generating: "border-edited/50 text-edited",
  ready: "border-good/40 text-good",
  failed: "border-bad/40 text-bad",
};

const STATUS_LABEL: Record<KitSummary["status"], string> = {
  pending: "Queued",
  generating: "Building",
  ready: "Ready",
  failed: "Stopped",
};

export default function KitsPage() {
  const { user } = useSession();
  const [kits, setKits] = useState<KitSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const load = () =>
      api<{ kits: KitSummary[] }>("/kits", { signal: controller.signal })
        .then((body) => setKits(body.kits))
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === "AbortError") return;
          setError(
            cause instanceof ApiError ? cause.message : "Could not load kits",
          );
        });

    void load();
    // Keep refreshing while anything is still building.
    const timer = setInterval(() => {
      setKits((current) => {
        if (current?.some((kit) => kit.status === "generating")) void load();
        return current;
      });
    }, 2_000);

    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, []);

  const ranked = useMemo(() => (kits ? [...kits].sort(byUrgency) : null), [kits]);
  const stats = useMemo(() => (kits ? aggregate(kits) : null), [kits]);

  // The single most urgent thing: the soonest upcoming, ready kit.
  const hero = ranked?.find(
    (kit) => kit.status === "ready" && kit.pulse && !kit.pulse.isPast,
  );
  const rest = ranked?.filter((kit) => kit.id !== hero?.id) ?? [];

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">{formatToday()}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {greeting()}
            {user ? (
              <span className="text-dim">, {nameFromEmail(user.email)}</span>
            ) : null}
          </h1>
        </div>
        <Link href="/kits/new" className="btn-primary">
          <Plus className="h-4 w-4" />
          New kit
        </Link>
      </header>

      {error && (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-bad/40 bg-bad/10 px-3 py-2
            text-sm text-bad"
        >
          {error}
        </p>
      )}

      {kits === null && !error && <DashboardSkeleton />}

      {kits?.length === 0 && <EmptyState />}

      {stats && kits && kits.length > 0 && (
        <>
          <StatStrip stats={stats} />

          {hero && <UrgentHero kit={hero} />}

          {rest.length > 0 && (
            <>
              <h2 className="mb-3 mt-10 text-sm font-semibold text-dim">
                {hero ? "Everything else" : "Your kits"}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {rest.map((kit, index) => (
                  <div
                    key={kit.id}
                    className="stagger"
                    style={{ "--i": Math.min(index, 8) } as React.CSSProperties}
                  >
                    <KitCard kit={kit} />
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </main>
  );
}

/* ---------------------------------------------------------------- stats --- */

interface Stats {
  readyKits: number;
  soonest: number | null;
  questionsSeen: number;
  questionsTotal: number;
  avgReadiness: number | null;
}

function aggregate(kits: KitSummary[]): Stats {
  const ready = kits.filter((kit) => kit.pulse && !kit.pulse.isPast);
  const upcoming = ready
    .map((kit) => kit.pulse!.daysUntilInterview)
    .filter((days) => days >= 0);

  const questionsSeen = ready.reduce((sum, k) => sum + k.pulse!.questionsSeen, 0);
  const questionsTotal = ready.reduce(
    (sum, k) => sum + k.pulse!.questionsTotal,
    0,
  );

  return {
    readyKits: ready.length,
    soonest: upcoming.length ? Math.min(...upcoming) : null,
    questionsSeen,
    questionsTotal,
    avgReadiness: ready.length
      ? Math.round(
          ready.reduce((sum, k) => sum + k.pulse!.readiness, 0) / ready.length,
        )
      : null,
  };
}

function StatStrip({ stats }: { stats: Stats }) {
  return (
    <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile
        icon={<CalendarClock className="h-4 w-4" />}
        accent="text-accent"
        value={stats.soonest === null ? "—" : String(stats.soonest)}
        unit={stats.soonest === null ? "" : plural(stats.soonest, "day")}
        label="Next interview"
      />
      <StatTile
        icon={<Target className="h-4 w-4" />}
        accent="text-cyan"
        value={stats.avgReadiness === null ? "—" : String(stats.avgReadiness)}
        unit={stats.avgReadiness === null ? "" : "avg readiness"}
        label="Across active kits"
      />
      <StatTile
        icon={<ListChecks className="h-4 w-4" />}
        accent="text-good"
        value={`${stats.questionsSeen}`}
        unit={`of ${stats.questionsTotal} practised`}
        label="Questions"
      />
      <StatTile
        icon={<Flame className="h-4 w-4" />}
        accent="text-pinned"
        value={String(stats.readyKits)}
        unit={plural(stats.readyKits, "kit")}
        label="In flight"
      />
    </div>
  );
}

function StatTile({
  icon,
  accent,
  value,
  unit,
  label,
}: {
  icon: React.ReactNode;
  accent: string;
  value: string;
  unit: string;
  label: string;
}) {
  return (
    <div className="card p-4">
      <div className={`flex items-center gap-1.5 ${accent}`}>{icon}</div>
      <p className="mt-3 flex items-baseline gap-1.5">
        <span className="tnum text-2xl font-semibold text-paper">{value}</span>
        <span className="text-xs text-faint">{unit}</span>
      </p>
      <p className="label mt-1">{label}</p>
    </div>
  );
}

/* ------------------------------------------------------------- the hero --- */

function UrgentHero({ kit }: { kit: KitSummary }) {
  const pulse = kit.pulse!;
  const soon = pulse.isInterviewDay || pulse.daysUntilInterview <= 1;

  return (
    <Link
      href={`/kits/${kit.id}`}
      className="card-interactive group mt-4 block overflow-hidden bg-hero-grad
        p-6 sm:p-8"
    >
      <div className="flex flex-col gap-8 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="label flex items-center gap-1.5 text-accent">
            <Sparkles className="h-3.5 w-3.5" />
            Most urgent
          </p>
          <h2 className="mt-2 truncate text-2xl font-semibold text-paper">
            {kit.title}
          </h2>
          <p className="mt-1 text-sm text-dim">
            {kit.interviewDate
              ? formatCivilDate(kit.interviewDate)
              : plural(kit.request.days, "day")}
          </p>

          <div className="mt-4 flex flex-wrap items-baseline gap-2">
            <span
              className={`text-display-sm font-light tnum ${
                soon ? "text-warn" : "text-paper"
              }`}
            >
              {pulse.isInterviewDay ? "Today" : pulse.daysUntilInterview}
            </span>
            {!pulse.isInterviewDay && (
              <span className="text-lg text-dim">
                {plural(pulse.daysUntilInterview, "day")} to go
              </span>
            )}
          </div>

          <p className="mt-5 flex items-center gap-2 text-sm">
            <span className="rounded-lg bg-accent/15 px-2 py-1 font-medium text-accent">
              Next
            </span>
            <span className="min-w-0 truncate text-paper">{pulse.nextAction}</span>
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <span className="btn-primary">
              Open this kit
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </span>
          </div>
        </div>

        <div className="shrink-0 self-center">
          <Ring value={pulse.readiness} size={132} thickness={9}>
            <div className="text-center">
              <div className="text-3xl font-light text-paper">
                <CountUp value={pulse.readiness} />
              </div>
              <div
                className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide"
                style={{ color: readinessColour(pulse.readiness) }}
              >
                ready
              </div>
            </div>
          </Ring>
        </div>
      </div>
    </Link>
  );
}

/* ------------------------------------------------------------ kit cards --- */

function KitCard({ kit }: { kit: KitSummary }) {
  const pulse = kit.pulse;
  const away = kit.interviewDate ? daysAway(kit.interviewDate) : null;
  const progress =
    pulse && pulse.questionsTotal > 0
      ? pulse.questionsSeen / pulse.questionsTotal
      : 0;

  return (
    <Link href={`/kits/${kit.id}`} className="card-interactive flex h-full gap-4 p-5">
      {pulse ? (
        <Ring value={pulse.readiness} size={64} thickness={6}>
          <span className="tnum text-sm font-semibold text-paper">
            {pulse.readiness}
          </span>
        </Ring>
      ) : (
        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full border border-dashed border-line-strong text-faint">
          <Sparkles className="h-5 w-5" />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 truncate font-semibold text-paper">
            {kit.title}
          </h3>
          <span className={`chip shrink-0 ${STATUS_TONE[kit.status]}`}>
            {kit.status === "generating" && (
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-edited" />
            )}
            {STATUS_LABEL[kit.status]}
          </span>
        </div>

        <p className="mt-0.5 truncate text-xs text-faint">
          {kit.interviewDate ? formatCivilDate(kit.interviewDate) : "No date set"}
        </p>

        {pulse ? (
          <div className="mt-auto pt-4">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-dim">
                {away !== null && away >= 0 ? (
                  <span className={away <= 1 ? "font-semibold text-warn" : ""}>
                    {pulse.isInterviewDay
                      ? "Interview today"
                      : `${plural(away, "day")} to go`}
                  </span>
                ) : (
                  <span className="text-faint">Interview passed</span>
                )}
              </span>
              <span className="tnum text-faint">
                {pulse.questionsSeen}/{pulse.questionsTotal} practised
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-good transition-[width] duration-700 ease-spring"
                style={{ width: `${Math.max(2, progress * 100)}%` }}
              />
            </div>
          </div>
        ) : (
          <p className="mt-auto pt-4 text-xs text-faint">
            {kit.status === "failed" && kit.error
              ? kit.error.message
              : "Building your kit…"}
          </p>
        )}
      </div>
    </Link>
  );
}

/* --------------------------------------------------------- empty & load --- */

function EmptyState() {
  return (
    <div className="card mt-8 overflow-hidden bg-hero-grad p-12 text-center">
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-accent-grad text-white shadow-glow">
        <Sparkles className="h-7 w-7" />
      </span>
      <h2 className="mt-5 text-2xl font-semibold">Build your first kit</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-dim">
        Paste a job posting and the company&apos;s website, pick the interview
        date, and you get tailored questions, a day-by-day plan, spaced practice,
        and a mock interview — all built for you.
      </p>
      <Link href="/kits/new" className="btn-primary mx-auto mt-6 w-fit">
        <Plus className="h-4 w-4" />
        Start a kit
      </Link>
      <ul className="mx-auto mt-8 grid max-w-lg gap-2 text-left text-sm sm:grid-cols-3">
        {[
          "Tailored questions",
          "A study plan on real dates",
          "Spaced-repetition practice",
        ].map((line) => (
          <li key={line} className="flex items-center gap-2 text-dim">
            <CircleCheck className="h-4 w-4 shrink-0 text-good" />
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mt-6 space-y-4" aria-busy="true" aria-label="Loading">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-24" />
        ))}
      </div>
      <div className="skeleton h-44" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="skeleton h-32" />
        <div className="skeleton h-32" />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- date utils --- */

function formatToday(): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
}

/** Whole days from today to a civil date, negative once it has passed. */
function daysAway(date: string): number {
  const today = new Intl.DateTimeFormat("en-CA").format(new Date());
  return Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
      86_400_000,
  );
}

/**
 * Soonest interview first, but interviews already past drop to the bottom:
 * they are history, and history should not sit above Friday's interview.
 */
function byUrgency(left: KitSummary, right: KitSummary): number {
  const rank = (kit: KitSummary) => {
    if (!kit.interviewDate) return Number.MAX_SAFE_INTEGER - 1;
    const away = daysAway(kit.interviewDate);
    return away < 0 ? Number.MAX_SAFE_INTEGER : away;
  };
  return rank(left) - rank(right);
}
