"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Keeps one bad render inside the page it happened on. Without a boundary a
 * single unexpected shape from the API blanks the whole app, which is a much
 * worse failure than the one that caused it.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset(): void;
}) {
  useEffect(() => {
    console.error("[ui]", error);
  }, [error]);

  return (
    <main className="mx-auto max-w-lg px-6 py-20 text-center">
      <h1 className="text-xl font-semibold">This page could not be shown</h1>
      <p className="mt-2 text-sm text-muted">
        Your data is untouched — this is a display fault, not a lost kit.
      </p>

      {error.message && (
        <p className="mt-4 break-words rounded-lg border border-ink-line bg-ink-soft p-3 text-left font-mono text-xs text-muted">
          {error.message}
        </p>
      )}

      <div className="mt-6 flex justify-center gap-2">
        <button type="button" onClick={reset} className="btn-primary">
          Try again
        </button>
        <Link href="/kits" className="btn-ghost">
          Back to kits
        </Link>
      </div>
    </main>
  );
}
