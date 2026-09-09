'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { Navbar } from '@/components/homepage/navbar';
import { Hero } from '@/components/homepage/Hero';
import { SecuritySection } from '@/components/homepage/SecuritySection';
import { FeaturesGrid } from '@/components/homepage/FeaturesGrid';
import { HowItWorks } from '@/components/homepage/HowItWorks';
import { FinalCta } from '@/components/homepage/FinalCta';
import { Footer } from '@/components/homepage/Footer';
import { BRAND_COLORS } from '@/lib/brand-colors';

const SplashCursor = dynamic(() => import('@/components/ui/SplashCursor'), { ssr: false });
const ColorBends = dynamic(() => import('@/components/backgrounds/ColorBends'), { ssr: false });

export default function HomePage() {
  // Gated rather than hidden with CSS: a hidden canvas would still run its
  // shader every frame. Starts false so the server-rendered markup and the
  // first client paint agree, then enables after mount when motion is allowed.
  const [allowMotion, setAllowMotion] = useState(false);
  /**
   * SplashCursor is a WebGL fluid simulation driven by cursor movement. On a
   * touch device there is no cursor to drive it, so it was compiling shaders,
   * allocating framebuffers and running a simulation step every frame to
   * produce an effect the user cannot trigger - a second WebGL context beside
   * ColorBends, on exactly the hardware least able to afford one.
   *
   * `(pointer: fine)` is the right test rather than a width breakpoint: it
   * asks whether the primary input can actually hit a small target, so a
   * touchscreen laptop is treated as touch and a narrow desktop window still
   * gets the effect.
   */
  const [hasFinePointer, setHasFinePointer] = useState(false);
  useEffect(() => {
    setAllowMotion(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    setHasFinePointer(window.matchMedia('(pointer: fine)').matches);
  }, []);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="relative min-h-screen text-[#E7ECF2] antialiased"
    >
      {/* Background stack, fixed so it stays put while the page scrolls.
          Explicit z-0 / z-10 rather than a negative z-index: html and body
          both paint an opaque background colour, so a -z-10 layer would be
          painted behind them and never seen. The base colour moved here off
          <main> for the same reason - the shader has to sit above it. */}
      <div className="fixed inset-0 z-0 bg-[#0A0E13]" aria-hidden />

      {/*
       * Static stand-in for the shader, painted unconditionally underneath it.
       *
       * Everything about ColorBends is conditional - it needs JavaScript, a
       * WebGL context, a GPU that keeps that context alive, and motion to be
       * allowed - and until this existed, every one of those failing landed on
       * the same result: a flat #0A0E13 page with the brand nowhere in it.
       * That is what "it's just black on mobile" is. The causes are different
       * but the symptom is identical, so the fix is one layer that is always
       * there rather than four separate guards.
       *
       * It also covers the reduced-motion case properly. The old behaviour
       * removed the background entirely for those readers, which over-reads
       * the preference: prefers-reduced-motion asks for less movement, not
       * less colour. A still gradient honours it and keeps the design.
       *
       * CSS gradients, so it is in the server-rendered HTML and paints on the
       * first frame - no flash of black while the bundle loads.
       */}
      <div
        className="fixed inset-0 z-0 opacity-55"
        aria-hidden
        style={{
          backgroundImage: [
            `radial-gradient(120% 45% at 50% 52%, ${BRAND_COLORS.cyan}38 0%, transparent 62%)`,
            `radial-gradient(90% 30% at 20% 48%, ${BRAND_COLORS.purple}30 0%, transparent 70%)`,
            `radial-gradient(70% 22% at 78% 56%, ${BRAND_COLORS.cream}22 0%, transparent 72%)`,
          ].join(', '),
        }}
      />

      {allowMotion && (
        <div className="fixed inset-0 z-0 opacity-55" aria-hidden>
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

      <div className="relative z-10">
        {hasFinePointer && allowMotion && (
          <SplashCursor
            SIM_RESOLUTION={128}
            DYE_RESOLUTION={1440}
            DENSITY_DISSIPATION={3.5}
            VELOCITY_DISSIPATION={2}
            PRESSURE={0.1}
            CURL={3}
            SPLAT_RADIUS={0.2}
            SPLAT_FORCE={6000}
            COLOR_UPDATE_SPEED={10}
          />
        )}
        <Navbar />
        <Hero />
        <SecuritySection />
        <FeaturesGrid />
        <HowItWorks />
        <FinalCta />
        <Footer showEntityDisclosure={false} />
      </div>
    </main>
  );
}
