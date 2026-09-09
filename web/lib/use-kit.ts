"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";
import type { Job, KitDetail } from "./types";

const POLL_MS = 1_200;

interface KitState {
  kit: KitDetail | null;
  job: Job | null;
  loading: boolean;
  error: string | null;
}

/**
 * Owns one kit and its most recent job, polling only while work is actually in
 * flight. Polling is deliberate over a stream: a run is a handful of coarse
 * steps, and a poll survives a refresh, a second tab, and a laptop that slept,
 * none of which a socket would.
 */
export function useKit(kitId: string) {
  const [state, setState] = useState<KitState>({
    kit: null,
    job: null,
    loading: true,
    error: null,
  });

  // Read inside the interval without making it a dependency, which would tear
  // the timer down and rebuild it on every tick.
  const watching = useRef(false);

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const [kitBody, jobBody] = await Promise.all([
          api<{ kit: KitDetail }>(`/kits/${kitId}`, { signal }),
          api<{ job: Job | null }>(`/kits/${kitId}/job`, { signal }),
        ]);

        watching.current =
          kitBody.kit.status === "generating" || jobBody.job?.status === "running";

        setState({
          kit: kitBody.kit,
          job: jobBody.job,
          loading: false,
          error: null,
        });
        return kitBody.kit;
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return null;
        watching.current = false;
        setState((previous) => ({
          ...previous,
          loading: false,
          error: cause instanceof ApiError ? cause.message : "Could not load this kit",
        }));
        return null;
      }
    },
    [kitId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);

    const timer = setInterval(() => {
      // Stops on its own once the work settles, so a finished kit is not
      // polled forever in a background tab.
      if (watching.current) void refresh(controller.signal);
    }, POLL_MS);

    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [refresh]);

  /** Applies a server response that already contains the new kit. */
  const apply = useCallback((kit: KitDetail) => {
    setState((previous) => ({ ...previous, kit, error: null }));
  }, []);

  const regenerate = useCallback(async () => {
    await api(`/kits/${kitId}/generate`, { method: "POST" });
    watching.current = true;
    await refresh();
  }, [kitId, refresh]);

  return { ...state, refresh, apply, regenerate };
}
