"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sparkles, Upload } from "lucide-react";
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

      <BulkUpload />
    </main>
  );
}

interface BulkCase {
  id?: string;
  jd?: string;
  company_url?: string;
  days?: number;
}

interface BulkProgress {
  total: number;
  done: number;
  failed: number;
  message: string;
}

/**
 * Preparing for several roles at once, by uploading the same case file the
 * batch command takes. Each row becomes a kit through the ordinary create
 * endpoint — the same path the single form uses — so there is no second,
 * divergent way to make a kit. One failure does not stop the rest.
 */
function BulkUpload() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<BulkProgress | null>(null);

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(null);
    setProgress(null);

    let cases: BulkCase[];
    try {
      const parsed = JSON.parse(await file.text());
      cases = Array.isArray(parsed) ? parsed : parsed?.cases;
      if (!Array.isArray(cases)) throw new Error();
    } catch {
      setError(
        "That file could not be read. Expected a JSON array of { jd, company_url, days }.",
      );
      return;
    }

    const usable = cases.filter((entry) => entry.jd && entry.company_url);
    if (usable.length === 0) {
      setError("No usable cases found. Each needs at least a jd and a company_url.");
      return;
    }

    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    let done = 0;
    let failed = 0;

    for (const [index, entry] of usable.entries()) {
      setProgress({
        total: usable.length,
        done,
        failed,
        message: `Starting ${index + 1} of ${usable.length}…`,
      });
      try {
        await api("/kits", {
          method: "POST",
          body: {
            jd: entry.jd,
            companyUrl: entry.company_url,
            days: entry.days && entry.days > 0 ? entry.days : 7,
            timeZone,
          },
        });
        done += 1;
      } catch {
        // One bad row must not abort the batch, exactly like the CLI.
        failed += 1;
      }
    }

    setProgress({
      total: usable.length,
      done,
      failed,
      message: "Done. Your kits are building.",
    });
    // Let them read the summary, then send them to watch the dashboard.
    setTimeout(() => router.push("/kits"), 1_200);
  }

  return (
    <section className="mt-10 border-t border-line pt-8">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        className="flex w-full items-center justify-between text-left"
      >
        <span>
          <span className="flex items-center gap-2 font-medium">
            <Upload className="h-4 w-4 text-cyan" />
            Preparing for several roles?
          </span>
          <span className="mt-0.5 block text-sm text-dim">
            Upload a file of description-and-company pairs and build them all at
            once.
          </span>
        </span>
        <span className="text-faint">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          <label
            className="flex cursor-pointer flex-col items-center justify-center
              gap-2 rounded-xl border border-dashed border-line-strong
              bg-surface px-4 py-8 text-center transition hover:border-cyan/50"
          >
            <Upload className="h-6 w-6 text-faint" />
            <span className="text-sm text-dim">
              Choose a JSON file of{" "}
              <code className="text-faint">
                {"[{ jd, company_url, days }]"}
              </code>
            </span>
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => void onFile(event)}
            />
          </label>

          {error && <p className="text-sm text-bad">{error}</p>}

          {progress && (
            <div className="rounded-xl border border-line bg-surface p-4 text-sm">
              <p className="text-paper">{progress.message}</p>
              <p className="mt-1 text-xs text-dim">
                {progress.done} created
                {progress.failed > 0 ? ` · ${progress.failed} failed` : ""} of{" "}
                {progress.total}
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-cyan transition-[width]"
                  style={{
                    width: `${((progress.done + progress.failed) / progress.total) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
