'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { BRAND_COLORS } from '@/lib/brand-colors';

const ColorBends = dynamic(() => import('@/components/backgrounds/ColorBends'), { ssr: false });

/**
 * The shared page backdrop: a flat base colour plus the ColorBends shader,
 * both fixed so they stay put while the page scrolls.
 *
 * Usage - the parent <main> must carry `isolate`, and must NOT paint its own
 * background:
 *
 *   <main className="relative isolate min-h-screen text-[#E7ECF2] antialiased">
 *     <PageBackground />
 *     ...sections...
 *   </main>
 *
 * `isolate` is load-bearing. html and body both paint an opaque background,
 * so without a stacking context on <main> these -z-10 layers would sit behind
 * body and never be visible. Isolating <main> keeps them inside its own
 * stacking context - painted below the page's in-flow content, above body.
 * That ordering is why the sections below need no z-index of their own.
 *
 * A server component can render this directly; the 'use client' boundary is
 * here so pages keep their `metadata` export.
 */
export function PageBackground() {
  // Gated in state rather than hidden with CSS: a hidden canvas would still
  // run its shader every frame. Starts false so the server-rendered markup
  // and the first client paint agree, then enables after mount when motion
  // is allowed.
  const [allowMotion, setAllowMotion] = useState(false);
  useEffect(() => {
    setAllowMotion(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  return (
    <>
      <div className="fixed inset-0 -z-10 bg-[#0A0E13]" aria-hidden />
      {allowMotion && (
        <div className="fixed inset-0 -z-10 opacity-55" aria-hidden>
          <ColorBends
            colors={[BRAND_COLORS.cyan, BRAND_COLORS.purple, BRAND_COLORS.cream]}
            rotation={90}
            speed={0.14}
            scale={1.4}
            frequency={1}
            warpStrength={1}
            mouseInfluence={0.5}
            noise={0.12}
            parallax={0.3}
            iterations={1}
            intensity={1.2}
            bandWidth={7}
            transparent
          />
        </div>
      )}
    </>
  );
}
