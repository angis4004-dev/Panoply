'use client';

import { useEffect, useRef } from 'react';
import { createAmbientGlobe, type AmbientGlobeHandle } from './ambientGlobeScene';

interface AmbientGlobeProps {
  className?: string;
}

/**
 * Small ambient particle-globe animation - a lightweight, background-only
 * successor to the full-screen "Deploy Engine" hero that turned out to be
 * too heavy and too busy for the homepage. This is meant to be barely
 * noticeable: a slow, subtle animated texture inside the existing hero
 * card, not a focal element.
 */
export function AmbientGlobe({ className = '' }: AmbientGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const handle: AmbientGlobeHandle = createAmbientGlobe(container, prefersReducedMotion);

    const handleResize = () => handle.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      handle.dispose();
    };
  }, []);

  return <div ref={containerRef} className={className} aria-hidden />;
}
