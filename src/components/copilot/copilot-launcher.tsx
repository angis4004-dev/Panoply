'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sparkles, X } from 'lucide-react';
import { CopilotChat } from '@/components/copilot/copilot-chat';

/**
 * Ask Panoply, reachable from anywhere in the dashboard.
 *
 * The assistant used to live at one URL, which meant asking it something cost
 * you your place: you left the withdrawal screen to ask about withdrawals, and
 * came back to a page that had forgotten what you were doing. A sheet over the
 * current page keeps the thing you are asking about on screen behind it.
 *
 * The gesture is the point of the design, not decoration. Press the bubble and
 * drag: the top edge of the sheet tracks your finger exactly, because `visible
 * = viewportHeight - pointerY` is the whole model, and a sheet that follows
 * one-to-one is the difference between direct manipulation and an animation
 * that happens to be triggered by a swipe. Release and it settles on whichever
 * of the three positions you were nearest — closed, peek, full — unless you
 * flicked, in which case intent beats position.
 */

/** Visible height at each rest position, as a fraction of the viewport. */
const PEEK_FRACTION = 0.56;
const FULL_FRACTION = 0.94;

/**
 * Above this speed the release is read as a throw rather than a placement.
 *
 * 0.55 px/ms is about a fast but unhurried flick. Lower and ordinary careful
 * dragging starts getting interpreted as a throw, which feels like the sheet
 * is snatching itself out of your hand; higher and a genuine flick-to-dismiss
 * gets treated as a placement and the sheet stays open.
 */
const FLICK_VELOCITY = 0.55;

/** Movement under this many pixels is a tap that wobbled, not a drag. */
const TAP_SLOP = 6;

type Snap = 'closed' | 'peek' | 'full';

interface DragState {
  pointerId: number;
  startY: number;
  lastY: number;
  lastT: number;
  /** px per ms; positive is downward. */
  velocity: number;
  moved: boolean;
  pointerType: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function CopilotLauncher() {
  const pathname = usePathname();
  const [snap, setSnap] = useState<Snap>('closed');
  const [dragVisible, setDragVisible] = useState<number | null>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  /** Latches on the first open and never clears — see the note at the render. */
  const [everOpened, setEverOpened] = useState(false);

  const dragRef = useRef<DragState | null>(null);
  const snapRef = useRef<Snap>('closed');
  const bubbleRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  snapRef.current = snap;

  useEffect(() => {
    const measure = () => setViewportHeight(window.innerHeight);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReducedMotion(query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  const sheetHeight = Math.round(viewportHeight * FULL_FRACTION);
  const peekHeight = Math.round(viewportHeight * PEEK_FRACTION);

  const visibleForSnap = useCallback(
    (value: Snap) => (value === 'closed' ? 0 : value === 'peek' ? peekHeight : sheetHeight),
    [peekHeight, sheetHeight]
  );

  const open = snap !== 'closed';
  const dragging = dragVisible !== null;
  const visible = dragVisible ?? visibleForSnap(snap);
  const translateY = sheetHeight - visible;

  /* Escape closes; Cmd/Ctrl+K toggles.
   *
   * The keyboard equivalent of the gesture, and it opens straight to full —
   * somebody reaching for a shortcut has already decided they want the thing,
   * and a half-height sheet would just be a second step. */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSnap((current) => (current === 'closed' ? 'full' : 'closed'));
        return;
      }
      if (event.key === 'Escape' && snapRef.current !== 'closed') {
        setSnap('closed');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (open) setEverOpened(true);
  }, [open]);

  // The page behind must not scroll under the sheet — on touch especially,
  // where a flick that misses the transcript would otherwise scroll the page
  // the user thinks they have covered up.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Focus follows the sheet in and back out again, so a keyboard user is not
  // left tabbing through a page they can no longer see.
  useEffect(() => {
    if (open) sheetRef.current?.focus();
    else bubbleRef.current?.focus({ preventScroll: true });
    // Intentionally only on the open/closed transition, not on every snap
    // change — refocusing while resizing would steal focus from the composer.
  }, [open]);

  /** Where a release lands: intent first, position second. */
  const resolveSnap = useCallback(
    (height: number, velocity: number): Snap => {
      if (velocity > FLICK_VELOCITY) {
        // Thrown downwards. Step down one position rather than always closing,
        // so a flick from full lands on peek and the conversation survives.
        return height > peekHeight ? 'peek' : 'closed';
      }
      if (velocity < -FLICK_VELOCITY) return 'full';

      const distances: [Snap, number][] = [
        ['closed', Math.abs(height - 0)],
        ['peek', Math.abs(height - peekHeight)],
        ['full', Math.abs(height - sheetHeight)],
      ];
      return distances.sort((a, b) => a[1] - b[1])[0][0];
    },
    [peekHeight, sheetHeight]
  );

  const onPointerDown = (event: React.PointerEvent) => {
    // Only the primary button, and never a pointer that is already dragging.
    if (event.button !== 0 || dragRef.current) return;

    /*
     * Capture keeps the move and up events coming to this element even once
     * the finger has travelled well off it, which for a drag that starts on a
     * 56px bubble and ends near the top of the screen is every drag.
     *
     * It can throw - the spec raises NotFoundError if the pointer is already
     * gone - and a throw here would abort the handler before the drag state
     * was recorded, leaving the gesture dead rather than degraded. Without
     * capture the drag still works while the pointer stays over the element,
     * so failing soft is strictly better than failing.
     */
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* Continue uncaptured. */
    }

    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      lastT: performance.now(),
      velocity: 0,
      moved: false,
      pointerType: event.pointerType,
    };
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const now = performance.now();
    // Guard the divisor: two moves can share a millisecond, and dividing by
    // zero would hand resolveSnap an Infinity that always reads as a flick.
    const elapsed = Math.max(1, now - drag.lastT);
    drag.velocity = (event.clientY - drag.lastY) / elapsed;
    drag.lastY = event.clientY;
    drag.lastT = now;
    if (Math.abs(event.clientY - drag.startY) > TAP_SLOP) drag.moved = true;

    if (drag.moved) setDragVisible(clamp(viewportHeight - event.clientY, 0, sheetHeight));
  };

  const endDrag = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;

    const height = dragVisible;
    setDragVisible(null);

    if (!drag.moved || height === null) {
      /*
       * A tap, not a drag. Touch opens to peek — a thumb can reach the
       * composer there and the page stays partly visible, which is the point
       * of asking in context. A mouse opens to full: there is no reachability
       * problem to solve on a desktop, and a half-height panel on a large
       * screen is just a smaller window for no reason.
       */
      setSnap(drag.pointerType === 'mouse' ? 'full' : 'peek');
      return;
    }

    setSnap(resolveSnap(height, drag.velocity));
  };

  // The dedicated page has the same conversation on it already; a bubble
  // offering to open a second copy over the top of it is noise.
  if (pathname === '/dashboard/ai') return null;

  /*
   * Nothing is animated until the viewport has actually been measured.
   *
   * The first render happens before the effect runs, so viewportHeight is 0,
   * sheetHeight is 0, and `translateY(0px)` over an auto-height element is a
   * sheet sitting fully open across the screen. Left as-is that is a flash of
   * the entire panel on every dashboard page load, which then slides away -
   * announcing a feature nobody asked for, on every navigation. A percentage
   * translate is the one offset that is correct without knowing the height,
   * and suppressing the transition stops the correction being animated.
   */
  const measured = viewportHeight > 0;
  const transform = measured ? `translateY(${translateY}px)` : 'translateY(100%)';
  const transition =
    !measured || dragging || reducedMotion ? 'none' : 'transform 320ms cubic-bezier(0.32,0.72,0,1)';

  return (
    <>
      {/* Backdrop. Its opacity tracks the sheet's height rather than snapping
          between two values, so a half-open sheet reads as half-open. */}
      <div
        aria-hidden="true"
        onClick={() => setSnap('closed')}
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]"
        style={{
          opacity: sheetHeight > 0 ? clamp(visible / sheetHeight, 0, 1) * 0.75 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: dragging || reducedMotion ? 'none' : 'opacity 320ms ease-out',
        }}
      />

      <button
        ref={bubbleRef}
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        aria-label="Ask Panoply"
        aria-expanded={open}
        // touch-none stops the browser scrolling the page out from under a
        // drag that starts here — the whole gesture depends on this element
        // keeping the pointer stream.
        className={`fixed bottom-5 right-5 z-40 flex h-14 items-center gap-2.5 rounded-full bg-primary pl-4 pr-5 text-primary-foreground shadow-lg touch-none transition-[opacity,transform] duration-fast ease-ds-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface ${
          open ? 'pointer-events-none scale-90 opacity-0' : 'opacity-100'
        }`}
        style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <Sparkles className="h-5 w-5" aria-hidden="true" />
        <span className="text-sm font-medium">Ask Panoply</span>
      </button>

      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="Ask Panoply"
        tabIndex={-1}
        inert={!open}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-b-0 border-ds-border bg-ds-surface shadow-2xl focus:outline-none"
        style={{
          height: sheetHeight || undefined,
          transform,
          transition,
          // Nothing to click through to while it is off-screen, and this also
          // stops a fully-closed sheet swallowing taps at the bottom edge.
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        {/* The grab area. Deliberately the full width of the sheet and 32px
            tall rather than just the 36px pill inside it — the visible handle
            is a sign saying "drag here", not the target itself. */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="flex shrink-0 cursor-grab touch-none items-center justify-center py-2.5 active:cursor-grabbing"
        >
          <div className="h-1 w-9 rounded-full bg-ds-border-strong" />
        </div>

        <div className="flex shrink-0 items-center justify-between border-b border-ds-border px-4 pb-2.5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-ds-text">Ask Panoply</h2>
          </div>
          <button
            type="button"
            onClick={() => setSnap('closed')}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ds-text-muted transition-colors duration-fast ease-ds-out [@media(hover:hover)_and_(pointer:fine)]:hover:bg-ds-surface-inset [@media(hover:hover)_and_(pointer:fine)]:hover:text-ds-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/*
          Mounted on first open and never unmounted after.
          Rendering it on every dashboard page load would run the chat's effects
          behind a closed sheet for every user who never opens it; unmounting it
          on close would throw away the conversation, which is the one thing a
          user reopening the sheet expects to still be there. `inert` on the
          sheet keeps the closed copy out of the tab order in the meantime.
        */}
        {everOpened ? (
          <div className="flex min-h-0 flex-1 flex-col overscroll-contain">
            <CopilotChat compact />
          </div>
        ) : null}
      </div>
    </>
  );
}
