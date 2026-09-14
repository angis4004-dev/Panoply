'use client';

import { useEffect, useRef, useState } from 'react';

interface RevealProps {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}

/**
 * Fades and slides content in as it crosses the viewport threshold, and
 * back out as it leaves - replaying every time, on scroll down or up.
 * Respects prefers-reduced-motion by showing content immediately and never
 * animating.
 *
 * IntersectionObserver is the only source of truth for visibility. An
 * earlier version also did a synchronous getBoundingClientRect() vs
 * window.innerHeight check on mount, to avoid a flash-hidden for
 * above-the-fold content - but mobile browsers (Safari/Chrome) frequently
 * misreport window.innerHeight on first paint before their dynamic URL bar
 * collapses/expands, especially right after a scroll-position restore. That
 * mismatch marked whole sections "already revealed" at mount on mobile, so
 * nothing ever animated in on scroll. The observer's own initial callback
 * (fires within a frame or two of observe()) already handles above-the-fold
 * content correctly without that fragile duplicate heuristic.
 */
export function Reveal({ children, delay = 0, className = '' }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Visible until the observer says otherwise. Starting hidden meant the
  // server-rendered HTML shipped every section at opacity 0: blank until the
  // bundle hydrated, blank in link previews and full-page captures, and blank
  // for good if the script failed. Now the first frame always shows content,
  // and the hide/reveal cycle only begins once JavaScript is actually running.
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    // The observer's first callback reports what is on screen right now:
    // content already in view stays put, content below the fold is hidden so
    // it can rise in when reached. A misreported viewport height on mobile
    // (the concern noted above) now errs toward showing content, not hiding it.
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0.15,
    });

    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      // Rises 16px out of a 4px blur on a strong ease-out, so it arrives fast
      // and settles slowly - "coming into focus" rather than "sliding up".
      // Only opacity, transform and filter are named: `transition-all` would
      // drag any unrelated change on a child into the same curve. The blur is
      // dropped entirely once visible (`blur-0`), so a revealed block never
      // keeps a filter layer alive while you read it.
      className={`transition-[opacity,transform,filter] duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] ${
        visible ? 'opacity-100 translate-y-0 blur-0' : 'opacity-0 translate-y-4 blur-[4px]'
      } ${className}`}
      style={{ transitionDelay: visible ? `${delay}ms` : '0ms' }}
    >
      {children}
    </div>
  );
}
