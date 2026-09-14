'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { SignalField } from '@/components/ui/signal-field';
import { CountUpOnView } from '@/components/ui/RollingNumber';
import { PanoplyMark } from '@/components/ui/PanoplyLogo';

/**
 * A vault, shown the way its own page would summarise it: three stat pills,
 * a three-month curve, and the vault's name with a way in.
 *
 * The curve draws itself left to right the first time the card is half on
 * screen, and the area under it fades in behind the line. It draws once and
 * stays: redrawing on every pass would turn a figure into a flourish. CSS in
 * styles/tailwind.css (.chart-draw / .chart-fill); reduced motion shows the
 * finished chart.
 */

const LINE =
  'M0 78 C28 78 40 44 78 42 S112 64 132 104 S172 136 204 122 S242 102 258 98 S284 60 314 55 S346 44 360 42';
const AREA = `${LINE} V150 H0 Z`;

function Pill({
  tone,
  icon,
  children,
}: {
  tone?: 'up' | 'risk';
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const colour =
    tone === 'up'
      ? 'text-ds-value-positive'
      : tone === 'risk'
        ? 'text-[#E58C9A]'
        : 'text-[#E7ECF2]';
  return (
    <span
      className={`inline-flex h-7 items-center gap-1.5 rounded-full bg-white/[0.05] px-2.5 font-mono text-xs ${colour}`}
    >
      <svg
        viewBox="0 0 16 16"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {icon}
      </svg>
      {children}
    </span>
  );
}

export function StrategyCard() {
  const ref = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setDrawn(true);
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <SignalField className="p-5 sm:p-6">
      <div ref={ref} className={drawn ? 'is-drawn' : undefined}>
        <div className="flex flex-wrap gap-1.5">
          <Pill
            icon={
              <>
                <ellipse cx="8" cy="6" rx="6" ry="2.5" />
                <path d="M2 6v4c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V6" />
              </>
            }
          >
            <CountUpOnView value={28.07} format={(n) => `$${n.toFixed(2)}M`} />
          </Pill>
          <Pill
            tone="up"
            icon={
              <>
                <path d="M1.5 11.5l4.5-4.5 3 3 5.5-5.5" />
                <path d="M10.5 4.5h4v4" />
              </>
            }
          >
            <CountUpOnView value={38.42} format={(n) => `+${n.toFixed(2)}% (3M)`} />
          </Pill>
          <Pill
            tone="risk"
            icon={
              <>
                <path d="M2.5 12a5.5 5.5 0 0 1 11 0" />
                <path d="M8 12l3-3.5" />
              </>
            }
          >
            5/10
          </Pill>
        </div>

        <svg
          viewBox="0 0 360 150"
          preserveAspectRatio="none"
          className="my-5 block h-36 w-full"
          aria-hidden
        >
          <defs>
            <linearGradient id="strategy-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#00D4AA" stopOpacity="0.22" />
              <stop offset="1" stopColor="#00D4AA" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path className="chart-fill" d={AREA} fill="url(#strategy-area)" />
          <path
            className="chart-draw"
            d={LINE}
            pathLength={1}
            fill="none"
            stroke="#00D4AA"
            strokeWidth={1.8}
          />
        </svg>

        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#0D1219] text-primary ring-2 ring-primary/30">
            <PanoplyMark size={22} />
          </span>
          <div className="min-w-0">
            <p className="font-display text-xl font-medium leading-tight text-white">
              Momentum Vault
            </p>
            <p className="text-xs text-ds-text-muted">Risk-managed · 3 months</p>
          </div>
          <Link
            href="/dashboard/vaults"
            className="ml-auto inline-flex min-h-[40px] items-center rounded-full border border-ds-border px-4 text-sm text-[#E7ECF2] transition duration-fast ease-ds-out hover:bg-white/5 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            View
          </Link>
        </div>
      </div>
    </SignalField>
  );
}
