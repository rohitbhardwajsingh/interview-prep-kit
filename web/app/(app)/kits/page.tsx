"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { KitSummary } from "@/lib/types";

const STATUS_TONE: Record<KitSummary["status"], string> = {
  pending: "border-ink-line text-muted",
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
          <p className="mt-1 text-sm text-muted">
            One per role you are preparing for.
          </p>
        </div>
        <Link href="/kits/new" className="btn-primary">
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
        <p className="mt-10 text-sm text-muted">Loading…</p>
      )}

      {kits?.length === 0 && (
        <div className="card mt-8 p-8 text-center">
          <p className="font-medium">Nothing here yet</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">
            Paste a job posting and the company&apos;s website, and say how many
            days you have. The rest is automatic.
          </p>
          <Link href="/kits/new" className="btn-primary mt-5">
            Build your first kit
          </Link>
        </div>
      )}

      <ul className="mt-8 space-y-2">
        {kits?.map((kit) => (
          <li key={kit.id}>
            <Link
              href={`/kits/${kit.id}`}
              className="card flex items-center gap-4 p-4 transition hover:border-muted/50"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{kit.title}</p>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {kit.request.days} day
                  {kit.request.days === 1 ? "" : "s"} ·{" "}
                  {new URL(kit.request.companyUrl).hostname.replace(/^www\./, "")}
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
        ))}
      </ul>
    </main>
  );
}
