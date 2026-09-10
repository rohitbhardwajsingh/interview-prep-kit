"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  spin: number;
  size: number;
  colour: string;
  life: number;
}

const COLOURS = ["#8b5cff", "#22d3ee", "#34e0a1", "#ffb347", "#4ea1ff"];

/**
 * A one-shot confetti burst on a full-screen canvas.
 *
 * The app is deliberately honest and unsentimental everywhere else — the score
 * will not flatter you — which is exactly why clearing your queue should feel
 * like something. It fires once when `when` becomes true, costs nothing when
 * idle, cleans up its own canvas, and stays silent for anyone who has asked
 * for reduced motion.
 */
export function Celebrate({ when }: { when: boolean }) {
  const fired = useRef(false);

  useEffect(() => {
    if (!when || fired.current) return;
    if (
      typeof window === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    fired.current = true;

    const canvas = document.createElement("canvas");
    canvas.style.cssText =
      "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:60";
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);

    const context = canvas.getContext("2d");
    if (!context) {
      canvas.remove();
      return;
    }

    // Two jets from the lower corners, arcing inward — reads as a burst rather
    // than rain, which suits a moment of arrival.
    const particles: Particle[] = [];
    for (const side of [-1, 1] as const) {
      for (let i = 0; i < 90; i += 1) {
        particles.push({
          x: side === -1 ? 0 : canvas.width,
          y: canvas.height,
          vx: side * (6 + Math.random() * 8),
          vy: -(11 + Math.random() * 11),
          rotation: Math.random() * Math.PI,
          spin: (Math.random() - 0.5) * 0.4,
          size: 5 + Math.random() * 6,
          colour: COLOURS[Math.floor(Math.random() * COLOURS.length)]!,
          life: 1,
        });
      }
    }

    let raf = 0;
    const gravity = 0.32;

    function frame() {
      if (!context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;

      for (const p of particles) {
        p.vy += gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.spin;
        p.life -= 0.008;
        if (p.life <= 0 || p.y > canvas.height + 40) continue;
        alive = true;

        context.save();
        context.globalAlpha = Math.max(0, p.life);
        context.translate(p.x, p.y);
        context.rotate(p.rotation);
        context.fillStyle = p.colour;
        context.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        context.restore();
      }

      if (alive) {
        raf = requestAnimationFrame(frame);
      } else {
        canvas.remove();
      }
    }

    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      canvas.remove();
    };
  }, [when]);

  return null;
}
