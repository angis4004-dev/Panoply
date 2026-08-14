'use client';

import { useEffect, useRef, useState } from 'react';
import { ScanLine } from 'lucide-react';
import { createDeployEngineScene, type DeployEngineScene, type TrackingPointScreen } from './scene';
import { ConfigSidebar, type DeployEngineControls } from './ConfigSidebar';
import { Reveal } from '@/components/ui/Reveal';

const DESKTOP_QUERY = '(min-width: 1024px)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

const DEFAULT_CONTROLS: DeployEngineControls = {
  marketVolatility: 0.6,
  capitalConcentration: 1.0,
  executionSpread: 0.4,
  liquidityVel: 1.0,
  riskTolerance: 0.5,
  orbitSpeed: 1.0,
  hudOpacity: 1.0,
  brandAccent: '#fff0c9',
};

const TRACKER_ORDER: [string, string][] = [
  ['hi-01', 'mid-x'],
  ['mid-x', 'lo-z'],
  ['lo-z', 'hi-01'],
];

/**
 * Deploy Engine hero - a Three.js particle-globe hero replacing the
 * previous chart-mockup hero, built from a supplied design spec ("Deploy
 * Engine v2.9"). Recolored onto Panoply's existing dark/cream brand rather
 * than the spec's literal indigo-on-white, since a white glass control
 * panel would clash with every other page in the app. See scene.ts and
 * shaders.ts for the Three.js/GLSL implementation.
 */
export function DeployEngineHero() {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<DeployEngineScene | null>(null);
  const markerRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const lineRefs = useRef<Record<string, SVGLineElement | null>>({});

  const [controls, setControls] = useState<DeployEngineControls>(DEFAULT_CONTROLS);

  function handleControlChange<K extends keyof DeployEngineControls>(
    key: K,
    value: DeployEngineControls[K]
  ) {
    setControls((prev) => ({ ...prev, [key]: value }));

    const scene = sceneRef.current;
    if (!scene) return;

    switch (key) {
      case 'marketVolatility':
        scene.updateUniforms({ uDistortion: value as number });
        break;
      case 'capitalConcentration':
        scene.updateUniforms({ uSize: value as number });
        break;
      case 'executionSpread':
        scene.updateUniforms({ uSpread: value as number });
        break;
      case 'liquidityVel':
        scene.updateUniforms({ liquidityVel: value as number });
        break;
      case 'riskTolerance':
        scene.updateUniforms({ riskTolerance: value as number });
        break;
      case 'orbitSpeed':
        scene.updateUniforms({ orbitSpeed: value as number });
        break;
      case 'brandAccent':
        scene.updateUniforms({ uColor: value as string });
        break;
      // hudOpacity has no shader/rotation equivalent - it only drives the
      // 2D SVG/marker overlay's CSS opacity, applied directly in the JSX
      // below from `controls.hudOpacity`.
    }
  }

  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const prefersReducedMotion = window.matchMedia(REDUCED_MOTION_QUERY).matches;

    const handleFrame = (points: TrackingPointScreen[]) => {
      for (const p of points) {
        const marker = markerRefs.current[p.id];
        if (marker) {
          marker.style.transform = `translate(${p.x}px, ${p.y}px)`;
        }
      }

      const byId = new Map(points.map((p) => [p.id, p]));
      for (const [fromId, toId] of TRACKER_ORDER) {
        const line = lineRefs.current[`${fromId}-${toId}`];
        const from = byId.get(fromId);
        const to = byId.get(toId);
        if (line && from && to) {
          line.setAttribute('x1', String(from.x));
          line.setAttribute('y1', String(from.y));
          line.setAttribute('x2', String(to.x));
          line.setAttribute('y2', String(to.y));
        }
      }
    };

    const scene = createDeployEngineScene(container, prefersReducedMotion, handleFrame);
    scene.setDesktopOffset(window.matchMedia(DESKTOP_QUERY).matches);
    scene.updateUniforms({
      uDistortion: DEFAULT_CONTROLS.marketVolatility,
      uSize: DEFAULT_CONTROLS.capitalConcentration,
      uSpread: DEFAULT_CONTROLS.executionSpread,
      uColor: DEFAULT_CONTROLS.brandAccent,
      liquidityVel: DEFAULT_CONTROLS.liquidityVel,
      riskTolerance: DEFAULT_CONTROLS.riskTolerance,
      orbitSpeed: DEFAULT_CONTROLS.orbitSpeed,
    });
    sceneRef.current = scene;

    const desktopQuery = window.matchMedia(DESKTOP_QUERY);
    const handleDesktopChange = (e: MediaQueryListEvent) => scene.setDesktopOffset(e.matches);
    desktopQuery.addEventListener('change', handleDesktopChange);

    const handleResize = () => scene.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      desktopQuery.removeEventListener('change', handleDesktopChange);
      window.removeEventListener('resize', handleResize);
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  return (
    <section className="relative h-screen w-full overflow-hidden bg-[#0A0E13]">
      {/* Background blob - follows brand accent color; mix-blend "screen"
          rather than the spec's "multiply" since this sits on a dark, not
          light, background (multiply against near-black would just read
          as black). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 opacity-40"
        style={{
          background: `radial-gradient(circle at 65% 45%, ${controls.brandAccent}33, transparent 60%)`,
          mixBlendMode: 'screen',
        }}
      />

      {/* Three.js canvas mount */}
      <div ref={canvasContainerRef} className="absolute inset-0 z-[1]" />

      {/* HUD tracker lines + point markers, projected from 3D each frame */}
      <div
        className="absolute inset-0 z-[5]"
        style={{ opacity: controls.hudOpacity, transition: 'opacity 180ms ease-out' }}
      >
        <svg className="absolute inset-0 h-full w-full" aria-hidden>
          {TRACKER_ORDER.map(([from, to]) => (
            <line
              key={`${from}-${to}`}
              ref={(el) => {
                lineRefs.current[`${from}-${to}`] = el;
              }}
              className="de-tracker-line"
              stroke="rgba(255, 240, 201, 0.35)"
              strokeWidth={1}
              strokeDasharray="4 2"
              style={{ vectorEffect: 'non-scaling-stroke' }}
            />
          ))}
        </svg>

        {[
          { id: 'hi-01', label: 'HI-01' },
          { id: 'mid-x', label: 'MID-X' },
          { id: 'lo-z', label: 'LO-Z' },
        ].map((point) => (
          <div
            key={point.id}
            ref={(el) => {
              markerRefs.current[point.id] = el;
            }}
            className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2"
          >
            <div className="relative h-6 w-6">
              <span className="absolute -left-px -top-px h-2.5 w-2.5 border-l border-t border-white/50" />
              <span className="absolute -bottom-px -right-px h-2.5 w-2.5 border-b border-r border-white/50" />
              <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" />
            </div>
            <span className="mt-1 block font-mono text-[10px] font-medium text-white/70">
              {point.label}
            </span>
          </div>
        ))}
      </div>

      {/* UI overlay - pointer-events-none at the root so the canvas still
          receives mouse-move for the globe's hover tilt; the sidebar opts
          back in with pointer-events-auto since its sliders need clicks. */}
      <main className="pointer-events-none absolute inset-0 z-20">
        <Reveal delay={0}>
          <header className="absolute left-6 top-6 flex items-center gap-2">
            <ScanLine className="h-3.5 w-3.5 text-primary" />
            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.05em] text-white/60">
              Deploy_Engine_v2.9
            </span>
          </header>
        </Reveal>

        <Reveal delay={100}>
          <h1 className="absolute left-6 top-[40%] z-30 max-w-3xl font-display text-6xl font-bold leading-[0.9] text-white sm:text-7xl lg:text-8xl">
            Set Trillions
            <br />
            to Work
          </h1>
        </Reveal>

        <Reveal delay={200} className="pointer-events-auto absolute bottom-6 right-6">
          <ConfigSidebar values={controls} onChange={handleControlChange} />
        </Reveal>
      </main>
    </section>
  );
}
