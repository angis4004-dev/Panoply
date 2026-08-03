'use client';

import { useEffect, useRef, useState } from 'react';

interface RollingNumberProps {
  value: number;
  format: (n: number) => string;
  durationMs?: number;
}

/**
 * Tweens the displayed number from its previous value to the new one
 * whenever `value` changes, instead of snapping - the "rotating" digit
 * effect. Respects prefers-reduced-motion by jumping straight to the
 * target value.
 */
export function RollingNumber({ value, format, durationMs = 700 }: RollingNumberProps) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      fromRef.current = to;
      setDisplay(to);
      return;
    }

    const start = performance.now();
    function tick(now: number) {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, durationMs]);

  return <span className="tabular-nums">{format(display)}</span>;
}

/**
 * Counts up from 0 to `value` the first time this element scrolls into
 * view, then stays put - a one-shot reveal moment for stat numbers, unlike
 * Reveal's fade which just repositions text. Respects prefers-reduced-motion
 * by showing the target value immediately.
 */
export function CountUpOnView({
  value,
  format,
  durationMs = 900,
}: {
  value: number;
  format: (n: number) => string;
  durationMs?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [target, setTarget] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTarget(value);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTarget(value);
          observer.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [value]);

  return (
    <span ref={ref}>
      <RollingNumber value={target} format={format} durationMs={durationMs} />
    </span>
  );
}

/**
 * Nudges `base` by a small random +/- percentage on an interval, so a
 * demo/mock metric reads as live rather than frozen. Purely decorative -
 * no backend behind it, same spirit as this page's static chart bars.
 */
export function useLiveDrift(base: number, driftPct = 0.006, intervalMs = 4000): number {
  const [value, setValue] = useState(base);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const id = setInterval(
      () => {
        setValue((v) => {
          const delta = v * driftPct * (Math.random() * 2 - 1);
          return Math.max(0, v + delta);
        });
      },
      intervalMs + Math.random() * 2000
    );
    return () => clearInterval(id);
  }, [driftPct, intervalMs]);

  return value;
}

const ACTIVITY_PHASES = ['RUNNING', 'SELL', 'HOLD'] as const;
export type ActivityPhase = (typeof ACTIVITY_PHASES)[number];

/**
 * Cycles a running signal flow through RUNNING -> SELL -> HOLD -> RUNNING on
 * an interval, so a live flow reads as actually doing something rather than
 * sitting on a static "running" label. Purely a decorative activity
 * indicator - it doesn't drive real trade execution or P&L, both of which
 * are already computed server-side (see bot-pnl.ts). Starts at a random
 * phase so multiple flow cards don't flip in lockstep.
 */
export function useActivityPhase(active: boolean, intervalMs = 5000): ActivityPhase {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * ACTIVITY_PHASES.length));

  useEffect(() => {
    if (!active) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const id = setInterval(
      () => setIndex((i) => (i + 1) % ACTIVITY_PHASES.length),
      intervalMs + Math.random() * 1500
    );
    return () => clearInterval(id);
  }, [active, intervalMs]);

  return active ? ACTIVITY_PHASES[index] : 'RUNNING';
}
