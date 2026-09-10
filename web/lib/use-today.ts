"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "./api";
import type { TodayView } from "./types";

interface TodayState {
  today: TodayView | null;
  loading: boolean;
  error: string | null;
}

/**
 * The home screen's data, recomputed by the server on every read.
 *
 * Nothing here is cached across a reload on purpose. "What should I do now"
 * depends on the date, on what was practised since, and on whether the kit
 * was regenerated underneath — so a stale answer is worse than a brief
 * loading state.
 */
export function useToday(kitId: string, enabled = true) {
  const [state, setState] = useState<TodayState>({
    today: null,
    loading: enabled,
    error: null,
  });

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!enabled) return;
      try {
        const body = await api<TodayView>(`/kits/${kitId}/today`, { signal });
        setState({ today: body, loading: false, error: null });
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setState({
          today: null,
          loading: false,
          error:
            cause instanceof ApiError
              ? cause.message
              : "Could not work out where you are",
        });
      }
    },
    [kitId, enabled],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return { ...state, reload: () => load() };
}
