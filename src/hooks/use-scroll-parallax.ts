'use client';

import { useEffect, useState } from 'react';

/**
 * Normalized 0-1 scroll progress over the first `distance` pixels of page
 * scroll, rAF-throttled so it never recomputes more than once per frame.
 * Used for subtle scroll-linked parallax/glow effects - always 0 when
 * prefers-reduced-motion is set, so those effects stay fully static.
 */
export function useScrollParallax(distance = 600): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let ticking = false;
    const update = () => {
      setProgress(Math.min(1, Math.max(0, window.scrollY / distance)));
      ticking = false;
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [distance]);

  return progress;
}
