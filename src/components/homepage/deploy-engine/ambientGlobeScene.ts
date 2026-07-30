import * as THREE from 'three';
import { particleVertexShader, particleFragmentShader } from './shaders';

/**
 * Lightweight version of the Deploy Engine particle globe, built for use
 * as a small ambient background visual inside the hero's existing card
 * (not the full-screen HUD/control-panel treatment in DeployEngineHero.tsx,
 * which turned out to be too heavy and too busy for the homepage - see
 * git history for that attempt).
 *
 * Deliberately stripped down from scene.ts for performance and restraint:
 * - ~4x fewer sphere segments (48 vs 96 = ~2,300 points instead of ~9,200)
 * - no orbit rings, no HUD tracker projection/SVG work per frame
 * - devicePixelRatio capped at 1, not 2
 * - low default uDistortion so the effect reads as a subtle ambient
 *   texture, not a loud focal element
 * - rotation only (no mouse-driven tilt) - one fewer per-frame computation
 */
export interface AmbientGlobeHandle {
  resize(): void;
  dispose(): void;
}

export function createAmbientGlobe(
  container: HTMLDivElement,
  prefersReducedMotion: boolean,
  accentColor = '#fff0c9'
): AmbientGlobeHandle {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(1);
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    45,
    container.clientWidth / container.clientHeight,
    0.1,
    100
  );
  camera.position.set(0, 0, 9);

  const color = new THREE.Color(accentColor);
  const uniforms = {
    uTime: { value: 0 },
    uDistortion: { value: 0.25 },
    uSize: { value: 0.55 },
    uSpread: { value: 0.3 },
    uColor: { value: new THREE.Vector3(color.r, color.g, color.b) },
    uRiskTolerance: { value: 0.2 },
    uOpacity: { value: 0.32 },
  };

  // Normal (not additive) blending, plus a low uOpacity: additive blending
  // sums every overlapping point sprite's color, so in the densely-packed
  // center of the sphere dozens of overlapping near-white points clip
  // straight to solid opaque white - a harsh blown-out disc rather than the
  // intended soft, barely-there texture. Normal blending composites alpha
  // instead of summing color, so density no longer forces a whiteout.
  const geometry = new THREE.SphereGeometry(2.2, 48, 48);
  const material = new THREE.ShaderMaterial({
    vertexShader: particleVertexShader,
    fragmentShader: particleFragmentShader,
    uniforms,
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  scene.add(points);

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  let rafId = 0;
  let disposed = false;
  const clock = new THREE.Clock();

  function frame() {
    if (disposed) return;
    rafId = requestAnimationFrame(frame);

    if (!prefersReducedMotion) {
      const delta = clock.getDelta();
      uniforms.uTime.value += delta;
      points.rotation.y += delta * 0.08;
      points.rotation.x += delta * 0.015;
    }

    renderer.render(scene, camera);
  }
  frame();

  return {
    resize,
    dispose() {
      disposed = true;
      cancelAnimationFrame(rafId);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    },
  };
}
