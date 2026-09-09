"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { KitSummary } from "@/lib/types";

const DAY_PRESETS = [2, 3, 5, 7, 14];

export default function NewKitPage() {
  const router = useRouter();
  const [jd, setJd] = useState("");
  const [companyUrl, setCompanyUrl] = useState("");
  const [days, setDays] = useState(7);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const body = await api<{ kit: KitSummary; jobId: string }>("/kits", {
        method: "POST",
        body: { jd, companyUrl, days },
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
      <h1 className="text-2xl font-semibold tracking-tight">New kit</h1>
      <p className="mt-1 text-sm text-muted">
        Three things, then it runs on its own for a minute or two.
      </p>

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
          <p className="mt-1.5 text-xs text-muted">
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
          <p className="mt-1.5 text-xs text-muted">
            Only their own site is read, and only what robots.txt allows.
          </p>
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">
            Days until the interview
          </legend>
          <div className="flex flex-wrap gap-2">
            {DAY_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                aria-pressed={days === preset}
                onClick={() => setDays(preset)}
                className={`btn ${
                  days === preset
                    ? "bg-edited text-ink"
                    : "border border-ink-line text-paper hover:bg-ink-line"
                }`}
              >
                {preset} days
              </button>
            ))}
            <input
              type="number"
              min={1}
              max={365}
              aria-label="Days until the interview"
              className="field w-24"
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
            />
          </div>
          <p className="mt-1.5 text-xs text-muted">
            This changes the plan, not just its length: a short run front-loads
            the must-haves and drops review days.
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
