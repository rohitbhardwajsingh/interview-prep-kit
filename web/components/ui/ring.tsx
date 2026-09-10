"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Readiness has a colour, and it is earned.
 *
 * The scale deliberately stays red for a long time. A progress ring that
 * turns green at sixty per cent is telling a comforting lie to someone who
 * is about to be interviewed, and the whole point of the score is that it
 * does not do that.
 */
export function readinessColour(score: number): string {
  if (score >= 80) return "#3ddc97";
  if (score >= 45) return "#ffb347";
  if (score >= 10) return "#ff8a5c";
  return "#ff5c7c";
}

interface RingProps {
  /** 0 to 100. */
  value: number;
  size?: number;
  thickness?: number;
  /** Rendered in the middle of the ring. */
  children?: React.ReactNode;
  className?: string;
}

/**
 * Draws itself once on arrival, then animates between values.
 *
 * The draw-on-entry is not decoration: it makes the number feel measured
 * rather than asserted, and it gives the eye a moment to find the ring
 * before it has to read what is inside it.
 */
export function Ring({
  value,
  size = 200,
  thickness = 10,
  children,
  className,
}: RingProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  // Starts empty so the first paint has something to animate from, even when
  // the value arrives with the very first render.
  const [drawn, setDrawn] = useState(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    frame.current = requestAnimationFrame(() => setDrawn(clamped));
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [clamped]);

  const colour = readinessColour(clamped);
  const offset = circumference * (1 - drawn / 100);

  return (
    <div
      className={`relative inline-grid place-items-center ${className ?? ""}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        // Starts the arc at twelve o'clock rather than three.
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#1c2130"
          strokeWidth={thickness}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colour}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition:
              "stroke-dashoffset 900ms cubic-bezier(0.22, 1, 0.36, 1), stroke 400ms linear",
            filter: `drop-shadow(0 0 12px ${colour}55)`,
          }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}
