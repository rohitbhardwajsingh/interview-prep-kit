"use client";

import { useKitContext } from "./kit-provider";

/**
 * What a kit sub-page shows when it has no kit body to render.
 *
 * The three reasons look identical to a naive `if (!kit.kit)` guard and are
 * not: a kit still being fetched should not say "not built yet", because to
 * someone who just built one that reads as their work having vanished. This
 * tells them which of the three it actually is.
 */
export function KitNotReady() {
  const { kit, loading, error } = useKitContext();

  if (loading && !kit) {
    return (
      <div className="skeleton h-80 w-full" aria-busy="true" aria-label="Loading" />
    );
  }

  if (error && !kit) {
    return (
      <p role="alert" className="text-sm text-bad">
        {error}
      </p>
    );
  }

  const building = kit?.status === "generating" || kit?.status === "pending";
  return (
    <p className="text-sm text-dim">
      {building
        ? "This kit is still being built. It will appear here the moment it is ready."
        : "This kit has not been built yet."}
    </p>
  );
}
