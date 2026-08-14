'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * The Signal Field.
 *
 * A card that behaves like an instrument rather than a button. Approach it and
 * a contour field bends toward the pointer, a trace runs the width of the card
 * once, and a few data glyphs realign - the visual language of something
 * detecting a signal, not something inviting a click.
 *
 * Everything here is deliberate about cost:
 *
 *   - No WebGL, no particles, no canvas. One inline SVG per card, whose paths
 *     are recomputed only while the pointer is inside it.
 *   - No idle animation. Nothing moves until a pointer or a focus ring
 *     arrives, and the loop cancels the moment either leaves. A page of these
 *     costs nothing while it sits there.
 *   - Nothing animated affects layout. Contours move by rewriting a path's `d`
 *     inside a fixed-size SVG; the glow and the border are opacity and
 *     gradient position; the headline nudge is a transform. No reflow.
 *
 * The three input paths are genuinely different, not one faked as another:
 *
 *   - Pointer: the field tracks the cursor.
 *   - Touch: a tap resolves the field to the touch point and settles - a
 *     finger has no hover, so a tracking effect would just flicker.
 *   - Keyboard: focus centres the field and runs the trace, with no
 *     cursor-following glow, because there is no cursor to follow.
 *
 * Under prefers-reduced-motion the geometry is drawn once, flat and static,
 * and the interaction reduces to a border and contrast change that still says
 * "this is the thing you are on".
 */

/** How many contour lines. Odd numbers read better - one sits at the middle. */
const CONTOUR_COUNT = 7;

/** Samples per contour. Enough for a smooth bend, few enough to be free. */
const SAMPLES = 18;

const VIEW_W = 100;
const VIEW_H = 60;

export type SignalFieldVariant = 'card' | 'panel' | 'cta';

interface Geometry {
  /** 0-1 across the card. 0.5/0.5 when driven by focus rather than a pointer. */
  x: number;
  y: number;
  strength: number;
}

const CENTRED: Geometry = { x: 0.5, y: 0.5, strength: 1 };

/**
 * Builds one contour path.
 *
 * Each line deflects toward the pointer: a gaussian in x decides how much of
 * the line is involved, and the vertical distance decides both how strongly
 * and in which direction. Lines above the pointer bend down, lines below bend
 * up, so the field pinches around it instead of rippling uniformly - which is
 * what makes it read as attraction rather than as a wave.
 */
function contourPath(rowIndex: number, geometry: Geometry, amplitude: number): string {
  const y = ((rowIndex + 0.5) / CONTOUR_COUNT) * VIEW_H;
  const px = geometry.x * VIEW_W;
  const py = geometry.y * VIEW_H;

  const sigmaX = VIEW_W * 0.22;
  const sigmaY = VIEW_H * 0.55;

  const vertical = Math.exp(-((y - py) ** 2) / (2 * sigmaY ** 2));
  const direction = Math.sign(py - y) || 0;

  let d = '';
  for (let i = 0; i < SAMPLES; i += 1) {
    const x = (i / (SAMPLES - 1)) * VIEW_W;
    const bump = Math.exp(-((x - px) ** 2) / (2 * sigmaX ** 2));
    const dy = direction * amplitude * bump * vertical * geometry.strength;
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${(y + dy).toFixed(2)}`;
    if (i < SAMPLES - 1) d += ' ';
  }
  return d;
}

/** Six glyphs on a loose grid. Fixed positions so nothing reflows. */
const GLYPHS = [
  { x: 14, y: 12 },
  { x: 38, y: 46 },
  { x: 62, y: 18 },
  { x: 84, y: 38 },
  { x: 26, y: 30 },
  { x: 72, y: 52 },
];

/**
 * Tracks the pointer and reports where the field should be centred.
 *
 * Returns a ref to attach, the current activation, and the handlers. Split out
 * from the component so a card with unusual markup can drive the same
 * behaviour without adopting the wrapper.
 */
export function useSignalField() {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const pending = useRef<Geometry | null>(null);

  const [active, setActive] = useState<null | 'pointer' | 'keyboard'>(null);
  const [geometry, setGeometry] = useState<Geometry>(CENTRED);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  // One frame in flight at a time. pointermove fires far faster than the
  // display refreshes, and recomputing seven paths per event rather than per
  // frame is the difference between free and janky on a trackpad.
  const schedule = useCallback((next: Geometry) => {
    pending.current = next;
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (pending.current) setGeometry(pending.current);
    });
  }, []);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    []
  );

  const track = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (reduced) return;
      // A touch pointer gets one resolve on contact, not continuous tracking.
      if (event.pointerType === 'touch' && active === 'pointer') return;

      const rect = event.currentTarget.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      schedule({
        x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
        y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
        strength: 1,
      });
    },
    [reduced, active, schedule]
  );

  const handlers = {
    onPointerEnter: (event: React.PointerEvent<HTMLDivElement>) => {
      setActive('pointer');
      track(event);
    },
    onPointerMove: track,
    onPointerLeave: () => {
      setActive((current) => (current === 'pointer' ? null : current));
      schedule(CENTRED);
    },
    // Focus anywhere inside counts: the card is usually focused via the link
    // it contains, not the card itself.
    onFocus: () => setActive((current) => current ?? 'keyboard'),
    onBlur: (event: React.FocusEvent<HTMLDivElement>) => {
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
      setActive((current) => (current === 'keyboard' ? null : current));
      schedule(CENTRED);
    },
  };

  return {
    ref,
    handlers,
    reduced,
    active,
    // Keyboard activation never follows a cursor - there is not one.
    geometry: active === 'keyboard' ? CENTRED : geometry,
  };
}

export function SignalField({
  children,
  className,
  variant = 'card',
  /** Small mono string revealed on activation, e.g. "SIGNAL 0.94". */
  readout,
}: {
  children: React.ReactNode;
  className?: string;
  variant?: SignalFieldVariant;
  readout?: string;
}) {
  // No ref of its own: every handler reads event.currentTarget, which is this
  // element. The hook still returns one for callers driving their own markup.
  const { handlers, reduced, active, geometry } = useSignalField();
  const engaged = active !== null;

  // Amplitude is the whole difference between "instrument" and "toy". Four
  // units on a sixty-unit canvas is a deflection you notice without being
  // able to point at it.
  const amplitude = variant === 'cta' ? 5 : 4;

  return (
    <div
      {...handlers}
      data-signal-active={engaged ? active : undefined}
      className={cn(
        'group/signal relative isolate overflow-hidden',
        'transition-[border-color,background-color] duration-base ease-ds-out',
        // A cta has no surface of its own. It sits behind buttons that carry
        // their own opaque fill, so a card border and background here would
        // box them in and the field would be hidden behind them anyway - the
        // field reads in the space around and between them instead.
        variant === 'cta'
          ? 'rounded-xl'
          : cn(
              'rounded-2xl border border-ds-border bg-ds-surface-raised/60',
              engaged && 'border-[#00D4FF]/35 bg-ds-surface-raised/80'
            ),
        className
      )}
      style={
        {
          '--sx': `${geometry.x * 100}%`,
          '--sy': `${geometry.y * 100}%`,
        } as React.CSSProperties
      }
    >
      {/*
       * The field. aria-hidden throughout: it carries no information a screen
       * reader could use, and announcing "graphic" six times per card would be
       * pure noise over the content that matters.
       */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          className={cn(
            'absolute inset-0 h-full w-full transition-opacity duration-base ease-ds-out',
            engaged ? 'opacity-100' : 'opacity-[0.35]'
          )}
        >
          {Array.from({ length: CONTOUR_COUNT }, (_, row) => (
            <path
              key={row}
              d={contourPath(
                row,
                reduced ? CENTRED : geometry,
                reduced || !engaged ? 0 : amplitude
              )}
              fill="none"
              stroke="currentColor"
              strokeWidth={0.25}
              className={cn(
                'text-ds-border-strong transition-colors duration-base ease-ds-out',
                engaged && 'text-[#00D4FF]/25'
              )}
            />
          ))}

          {/* Glyphs. They lean a little toward the pointer, which is what
              makes the contours read as a field the glyphs sit in rather than
              as decoration behind them. */}
          {GLYPHS.map((glyph, index) => {
            const dx = geometry.x * VIEW_W - glyph.x;
            const dy = geometry.y * VIEW_H - glyph.y;
            const distance = Math.hypot(dx, dy) || 1;
            const pull = reduced || !engaged ? 0 : Math.min(2.2, 26 / distance);
            return (
              <circle
                key={index}
                cx={glyph.x + (dx / distance) * pull}
                cy={glyph.y + (dy / distance) * pull}
                r={0.5}
                className={cn(
                  'transition-colors duration-base ease-ds-out',
                  engaged ? 'fill-[#00D4FF]/60' : 'fill-ds-border-strong'
                )}
              />
            );
          })}

          {/* The trace. Runs once per activation - keyed on the activation so
              re-entering replays it - and is simply absent under reduced
              motion rather than played slowly. */}
          {engaged && !reduced && (
            <path
              key={`trace-${active}`}
              d={contourPath(Math.floor(CONTOUR_COUNT / 2), geometry, amplitude)}
              fill="none"
              stroke="#00D4FF"
              strokeWidth={0.45}
              strokeLinecap="round"
              // Normalises the dash maths to fractions of the line - see the
              // .signal-trace rule in styles/tailwind.css.
              pathLength={1}
              className="signal-trace"
            />
          )}
        </svg>

        {/* Restrained glow. Capped low on purpose: a bright follower turns a
            precise instrument into a torch. */}
        {!reduced && (
          <div
            className={cn(
              'absolute inset-0 transition-opacity duration-base ease-ds-out',
              engaged && active === 'pointer' ? 'opacity-100' : 'opacity-0'
            )}
            style={{
              background:
                'radial-gradient(18rem 18rem at var(--sx) var(--sy), rgba(0,212,255,0.10), transparent 70%)',
            }}
          />
        )}

        {/* Border highlight, angled by the pointer rather than spinning on a
            timer - it tracks where you are, so it reads as a response. */}
        <div
          className={cn(
            'absolute inset-0 transition-opacity duration-base ease-ds-out',
            variant === 'cta' ? 'rounded-xl' : 'rounded-2xl',
            engaged ? 'opacity-100' : 'opacity-0'
          )}
          style={{
            padding: '1px',
            background:
              'radial-gradient(12rem 12rem at var(--sx) var(--sy), rgba(0,212,255,0.55), transparent 65%)',
            WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
            WebkitMaskComposite: 'xor',
            maskComposite: 'exclude',
          }}
        />
      </div>

      {children}

      {readout && (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute right-4 top-4 font-mono text-[0.625rem] uppercase tracking-widest text-[#00D4FF] transition-all duration-base ease-ds-out',
            engaged ? 'translate-y-0 opacity-80' : '-translate-y-1 opacity-0'
          )}
        >
          {readout}
        </span>
      )}
    </div>
  );
}

/**
 * The 1-2px headline nudge, as a class rather than a component.
 *
 * Put it on the heading inside a SignalField. Kept separate because which
 * element should move is a per-card decision, and a wrapper that guessed would
 * be wrong as often as right.
 */
export const signalHeadline =
  'transition-transform duration-base ease-ds-out group-hover/signal:translate-x-[2px] group-focus-within/signal:translate-x-[2px] motion-reduce:transform-none';
