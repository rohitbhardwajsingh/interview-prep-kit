"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { formatCivilDate } from "@/lib/format";
import type { KitSummary } from "@/lib/types";

/** Whole days from today to a civil date, negative once it has passed. */
function daysAway(date: string): number {
  const today = new Intl.DateTimeFormat("en-CA").format(new Date());
  return Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
      86_400_000,
  );
}

/**
 * Soonest first, but interviews already past drop to the bottom: they are
 * history, and history should not sit above the thing happening on Friday.
 */
function byUrgency(left: KitSummary, right: KitSummary): number {
  const rank = (kit: KitSummary) => {
    if (!kit.interviewDate) return Number.MAX_SAFE_INTEGER - 1;
    const away = daysAway(kit.interviewDate);
    return away < 0 ? Number.MAX_SAFE_INTEGER : away;
  };
  return rank(left) - rank(right);
}

const STATUS_TONE: Record<KitSummary["status"], string> = {
  pending: "border-line text-dim",
  generating: "border-edited/50 text-edited",
  ready: "border-good/40 text-good",
  failed: "border-bad/40 text-bad",
};

const STATUS_LABEL: Record<KitSummary["status"], string> = {
  pending: "Not started",
  generating: "Building",
  ready: "Ready",
  failed: "Stopped",
};

export default function KitsPage() {
  const [kits, setKits] = useState<KitSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const load = () =>
      api<{ kits: KitSummary[] }>("/kits", { signal: controller.signal })
        .then((body) => {
          setKits(body.kits);
          return body.kits;
        })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === "AbortError") return [];
          setError(cause instanceof ApiError ? cause.message : "Could not load kits");
          return [];
        });

    void load();

    // Refreshed while anything is still building, so a kit started in another
    // tab appears here without a manual reload.
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

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your kits</h1>
          <p className="mt-1 text-sm text-dim">
            One per role you are preparing for.
          </p>
        </div>
        <Link href="/kits/new" className="btn-primary">
          <Plus className="h-4 w-4" />
          New kit
        </Link>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-6 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad"
        >
          {error}
        </p>
      )}

      {kits === null && !error && (
        <p className="mt-10 text-sm text-dim">Loading…</p>
      )}

      {kits?.length === 0 && (
        <div className="card mt-8 p-10 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent">
            <Sparkles className="h-6 w-6" />
          </span>
          <p className="mt-4 text-lg font-semibold">Nothing here yet</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-dim">
            Paste a job posting and the company&apos;s website, pick the
            interview date, and the rest builds itself.
          </p>
          <Link href="/kits/new" className="btn-primary mt-6">
            <Plus className="h-4 w-4" />
            Build your first kit
          </Link>
        </div>
      )}

      {/* Soonest interview first, because that is the one that matters and
          the order a list of deadlines is expected to be in. */}
      <ul className="stagger mt-8 space-y-2">
        {kits
          ?.slice()
          .sort(byUrgency)
          .map((kit, index) => {
            const away = kit.interviewDate ? daysAway(kit.interviewDate) : null;

            return (
              <li
                key={kit.id}
                style={{ "--i": Math.min(index, 8) } as React.CSSProperties}
              >
                <Link
                  href={`/kits/${kit.id}`}
                  className="card-interactive flex items-center gap-4 p-4"
                >
                  {away !== null && (
                    <div className="w-14 shrink-0 text-center">
                      <div
                        className={`tnum text-2xl font-light leading-none ${
                          away < 0
                            ? "text-faint"
                            : away <= 1
                              ? "text-warn"
                              : "text-paper"
                        }`}
                      >
                        {away < 0 ? "—" : away}
                      </div>
                      <div className="label mt-1">
                        {away < 0 ? "past" : away === 1 ? "day" : "days"}
                      </div>
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{kit.title}</p>
                    <p className="mt-0.5 truncate text-xs text-dim">
                      {kit.interviewDate
                        ? formatCivilDate(kit.interviewDate)
                        : `${kit.request.days} day${kit.request.days === 1 ? "" : "s"}`}{" "}
                      ·{" "}
                      {new URL(kit.request.companyUrl).hostname.replace(
                        /^www\./,
                        "",
                      )}
                      {kit.status === "failed" && kit.error
                        ? ` · ${kit.error.message}`
                        : ""}
                    </p>
                  </div>

                  <span className={`chip ${STATUS_TONE[kit.status]}`}>
                    {kit.status === "generating" && (
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-edited" />
                    )}
                    {STATUS_LABEL[kit.status]}
                  </span>
                </Link>
              </li>
            );
          })}
      </ul>
    </main>
  );
}
