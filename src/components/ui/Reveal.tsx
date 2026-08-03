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
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0.15,
    });

    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
      } ${className}`}
      style={{ transitionDelay: visible ? `${delay}ms` : '0ms' }}
    >
      {children}
    </div>
  );
}
