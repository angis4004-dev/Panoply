'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface RevealProps {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}

/**
 * Fades and slides content up as it enters the viewport. Respects
 * prefers-reduced-motion by showing content immediately, no animation.
 */
export function Reveal({ children, delay = 0, className = '' }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  // Synchronous, pre-paint check so above-the-fold content never waits on a
  // post-paint effect or observer callback - both can be delayed depending
  // on the browser/rendering pipeline.
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return;
    }

    const rect = node.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      setVisible(true);
    }
  }, []);

  // Scroll-triggered reveal for content that starts below the fold.
  useEffect(() => {
    if (visible) return;

    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );

    observer.observe(node);

    // Safety net: never leave content permanently hidden if the observer
    // fails to fire for any reason.
    const fallback = window.setTimeout(() => setVisible(true), 2000);

    return () => {
      observer.disconnect();
      window.clearTimeout(fallback);
    };
  }, [visible]);

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
