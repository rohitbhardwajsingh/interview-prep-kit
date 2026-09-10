"use client";

import { useEffect, useRef, useState } from "react";

interface CountUpProps {
  value: number;
  durationMs?: number;
  className?: string;
}

/**
 * Counts a number into place instead of snapping to it.
 *
 * The point is not the animation, it is that the eye follows a moving number
 * and lands on it. A readiness score that simply appears gets skimmed; one
 * that arrives gets read. It eases out, so most of the motion is over
 * quickly and the last few digits settle.
 */
export function CountUp({ value, durationMs = 900, className }: CountUpProps) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    const start = performance.now();
    const origin = from.current;
    const distance = value - origin;
    let raf = 0;

    // Skip the animation for anyone who has asked for less motion; they get
    // the final value immediately, which is the honest fallback.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      from.current = value;
      setShown(value);
      return;
    }

    function tick(at: number) {
      const progress = Math.min(1, (at - start) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setShown(Math.round(origin + distance * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return <span className={`tnum ${className ?? ""}`}>{shown}</span>;
}
