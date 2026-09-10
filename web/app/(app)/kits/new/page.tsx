"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { KitSummary } from "@/lib/types";

const PRESETS = [
  { days: 2, label: "In two days" },
  { days: 3, label: "In three days" },
  { days: 7, label: "Next week" },
  { days: 14, label: "In a fortnight" },
];

/** Today in the browser's own timezone, as YYYY-MM-DD. */
function todayLocal(): string {
  return new Intl.DateTimeFormat("en-CA").format(new Date());
}

function addDays(date: string, count: number): string {
  const [year, month, day] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const shifted = new Date(Date.UTC(year, month - 1, day + count));
  return shifted.toISOString().slice(0, 10);
}

export default function NewKitPage() {
  const router = useRouter();
  const [jd, setJd] = useState("");
  const [companyUrl, setCompanyUrl] = useState("");
  const [interviewDate, setInterviewDate] = useState(() =>
    addDays(todayLocal(), 7),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const today = todayLocal();
  const daysAway = Math.round(
    (Date.parse(`${interviewDate}T00:00:00Z`) -
      Date.parse(`${today}T00:00:00Z`)) /
      86_400_000,
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const body = await api<{ kit: KitSummary; jobId: string }>("/kits", {
        method: "POST",
        body: {
          jd,
          companyUrl,
          interviewDate,
          // Sent so the server knows when this user's day rolls over, rather
          // than assuming everyone lives in UTC.
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      // Straight to the kit, which shows the run in progress. The work is
      // already claimed server-side, so navigating away will not cancel it.
      router.push(`/kits/${body.kit.id}`);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not start");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link
        href="/kits"
        className="mb-6 inline-block text-sm text-dim transition hover:text-paper"
      >
        ← Kits
      </Link>
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent-grad text-white shadow-glow">
          <Sparkles className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">New kit</h1>
          <p className="text-sm text-dim">
            Three things, then it builds on its own for a minute or two.
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="mt-8 space-y-6">
        <div>
          <label htmlFor="jd" className="mb-1.5 block text-sm font-medium">
            The job posting
          </label>
          <textarea
            id="jd"
            required
            rows={12}
            className="field font-mono text-xs leading-relaxed"
            placeholder="Paste the whole thing — responsibilities, requirements, all of it."
            value={jd}
            onChange={(event) => setJd(event.target.value)}
          />
          <p className="mt-1.5 text-xs text-dim">
            {jd.length.toLocaleString()} characters. More detail means sharper
            questions; a two-line posting produces a thinner kit and says so.
          </p>
        </div>

        <div>
          <label htmlFor="url" className="mb-1.5 block text-sm font-medium">
            The company&apos;s website
          </label>
          <input
            id="url"
            type="url"
            required
            className="field"
            placeholder="https://example.com"
            value={companyUrl}
            onChange={(event) => setCompanyUrl(event.target.value)}
          />
          <p className="mt-1.5 text-xs text-dim">
            Only their own site is read, and only what robots.txt allows.
          </p>
        </div>

        {/* A date rather than a count, because the whole plan is built on it:
            days become weekdays, the countdown becomes real, and falling
            behind becomes something the app can notice. */}
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">
            When is the interview?
          </legend>
          <div className="flex flex-wrap gap-2">
            <input
              type="date"
              required
              min={today}
              aria-label="Interview date"
              className="field w-auto"
              value={interviewDate}
              onChange={(event) => setInterviewDate(event.target.value)}
            />
            {PRESETS.map((preset) => {
              const value = addDays(today, preset.days);
              return (
                <button
                  key={preset.days}
                  type="button"
                  aria-pressed={interviewDate === value}
                  onClick={() => setInterviewDate(value)}
                  className={
                    interviewDate === value ? "btn-primary" : "btn-ghost"
                  }
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-dim">
            {daysAway <= 0
              ? "That is today. You will get a single day's plan and the one-pager."
              : `${daysAway} study ${daysAway === 1 ? "day" : "days"}, ending the evening before. A short run front-loads the must-haves and drops review days.`}
          </p>
        </fieldset>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad"
          >
            {error}
          </p>
        )}

        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? "Starting…" : "Build my kit"}
        </button>
      </form>
    </main>
  );
}
