import * as THREE from 'three';
import { particleVertexShader, particleFragmentShader } from './shaders';

export interface SceneUniformsControl {
  uDistortion: number;
  uSize: number;
  uSpread: number;
  uColor: string;
  orbitSpeed: number;
  liquidityVel: number;
  riskTolerance: number;
}

export const DEFAULT_UNIFORMS: SceneUniformsControl = {
  uDistortion: 0.6,
  uSize: 1.0,
  uSpread: 0.4,
  uColor: '#fff0c9',
  orbitSpeed: 1.0,
  liquidityVel: 1.0,
  riskTolerance: 0.5,
};

export interface TrackingPointScreen {
  id: string;
  label: string;
  x: number;
  y: number;
}

interface TrackingPointDef {
  id: string;
  label: string;
  local: THREE.Vector3;
}

const TRACKING_POINTS: TrackingPointDef[] = [
  { id: 'hi-01', label: 'HI-01', local: new THREE.Vector3(3.2, 2.6, 1.4) },
  { id: 'mid-x', label: 'MID-X', local: new THREE.Vector3(-2.8, -0.4, 3.0) },
  { id: 'lo-z', label: 'LO-Z', local: new THREE.Vector3(0.6, -3.4, -1.8) },
];

function hexToVec3(hex: string): THREE.Vector3 {
  const c = new THREE.Color(hex);
  return new THREE.Vector3(c.r, c.g, c.b);
}

// Builds a circular ring of `count` loose points (the "dotted" orbit ring).
function buildDottedRingGeometry(radius: number, count: number): THREE.BufferGeometry {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = Math.sin(angle) * radius * 0.35;
    positions[i * 3 + 2] = Math.sin(angle) * radius * 0.2;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geometry;
}

// Builds a circular Line (not a Mesh) so LineDashedMaterial's dash pattern
// has something to measure distance along - RingGeometry is a flat disc and
// has no meaningful "dash" concept.
function buildDashedRingGeometry(radius: number, segments: number): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius * 0.4));
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}

export interface DeployEngineScene {
  setDesktopOffset(isDesktop: boolean): void;
  updateUniforms(partial: Partial<SceneUniformsControl>): void;
  resize(): void;
  dispose(): void;
}

export function createDeployEngineScene(
  container: HTMLDivElement,
  prefersReducedMotion: boolean,
  onFrame: (points: TrackingPointScreen[]) => void
): DeployEngineScene {
  const state: SceneUniformsControl = { ...DEFAULT_UNIFORMS };

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    45,
    container.clientWidth / container.clientHeight,
    0.1,
    100
  );
  camera.position.set(0, 0, 22);

  const mainGroup = new THREE.Group();
  mainGroup.position.x = 4.0;
  scene.add(mainGroup);

  const uniforms = {
    uTime: { value: 0 },
    uDistortion: { value: state.uDistortion },
    uSize: { value: state.uSize },
    uSpread: { value: state.uSpread },
    uColor: { value: hexToVec3(state.uColor) },
    uRiskTolerance: { value: state.riskTolerance },
  };

  const particleGeometry = new THREE.SphereGeometry(4.5, 96, 96);
  const particleMaterial = new THREE.ShaderMaterial({
    vertexShader: particleVertexShader,
    fragmentShader: particleFragmentShader,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const particles = new THREE.Points(particleGeometry, particleMaterial);
  mainGroup.add(particles);

  const ringColor = new THREE.Color(state.uColor);

  const torusRing = new THREE.Mesh(
    new THREE.TorusGeometry(5.2, 0.01, 8, 100),
    new THREE.MeshBasicMaterial({ color: ringColor, transparent: true, opacity: 0.5 })
  );
  torusRing.rotation.x = Math.PI / 2.4;
  mainGroup.add(torusRing);

  const dottedRing = new THREE.Points(
    buildDottedRingGeometry(5.6, 64),
    new THREE.PointsMaterial({ color: ringColor, size: 0.05, transparent: true, opacity: 0.6 })
  );
  dottedRing.rotation.x = Math.PI / 3;
  dottedRing.rotation.y = Math.PI / 6;
  mainGroup.add(dottedRing);

  const dashedRingMaterial = new THREE.LineDashedMaterial({
    color: ringColor,
    dashSize: 0.15,
    gapSize: 0.12,
    transparent: true,
    opacity: 0.45,
  });
  const dashedRingGeometry = buildDashedRingGeometry(5.9, 96);
  const dashedRing = new THREE.Line(dashedRingGeometry, dashedRingMaterial);
  dashedRing.computeLineDistances();
  dashedRing.rotation.x = -Math.PI / 5;
  mainGroup.add(dashedRing);

  // Tracking-point anchors ride along with mainGroup's rotation; their
  // world position is projected to screen space every frame.
  const trackerAnchors = TRACKING_POINTS.map((def) => {
    const anchor = new THREE.Object3D();
    anchor.position.copy(def.local);
    mainGroup.add(anchor);
    return { def, anchor };
  });

  const mouse = { x: 0, y: 0 };
  const targetRotation = { x: 0, y: 0 };
  function handlePointerMove(e: PointerEvent) {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
  }
  window.addEventListener('pointermove', handlePointerMove);

  function setDesktopOffset(desktop: boolean) {
    mainGroup.position.x = desktop ? 4.0 : 0;
  }

  function updateUniforms(partial: Partial<SceneUniformsControl>) {
    Object.assign(state, partial);
    if (partial.uDistortion !== undefined) uniforms.uDistortion.value = partial.uDistortion;
    if (partial.uSize !== undefined) uniforms.uSize.value = partial.uSize;
    if (partial.uSpread !== undefined) uniforms.uSpread.value = partial.uSpread;
    if (partial.uColor !== undefined) {
      uniforms.uColor.value = hexToVec3(partial.uColor);
      ringColor.set(partial.uColor);
    }
    if (partial.riskTolerance !== undefined) uniforms.uRiskTolerance.value = partial.riskTolerance;
  }

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  const projected = new THREE.Vector3();
  const halfW = () => container.clientWidth / 2;
  const halfH = () => container.clientHeight / 2;

  let rafId = 0;
  let disposed = false;
  const clock = new THREE.Clock();

  // Idle spin (continuous accumulation) and mouse-hover tilt (lerped toward
  // a target each frame) are tracked as separate offsets and summed onto
  // mainGroup.rotation - lerping the *combined* rotation.y directly against
  // a target that's supposed to include ongoing idle spin doesn't converge,
  // since the target itself would need to keep moving. Keeping them apart
  // means idle rotation keeps accumulating while the hover tilt smoothly
  // settles independently.
  let idleRotationY = 0;
  const mouseOffset = { x: 0, y: 0 };

  function frame() {
    if (disposed) return;
    rafId = requestAnimationFrame(frame);

    const delta = prefersReducedMotion ? 0 : clock.getDelta();

    if (!prefersReducedMotion) {
      uniforms.uTime.value += delta;
      idleRotationY += delta * 0.06 * state.liquidityVel;
      torusRing.rotation.z += delta * 0.15 * state.orbitSpeed;
      dottedRing.rotation.z -= delta * 0.1 * state.orbitSpeed;
      dashedRing.rotation.z += delta * 0.08 * state.orbitSpeed;

      targetRotation.x = mouse.y * 0.15;
      targetRotation.y = mouse.x * 0.15;
      mouseOffset.x += (targetRotation.x - mouseOffset.x) * 0.08;
      mouseOffset.y += (targetRotation.y - mouseOffset.y) * 0.08;

      mainGroup.rotation.x = mouseOffset.x;
      mainGroup.rotation.y = idleRotationY + mouseOffset.y;
    }

    // Object3D.matrixWorld (used by getWorldPosition) and the camera's
    // matrixWorldInverse (used by Vector3.project) are normally refreshed
    // as a side effect of renderer.render() - but that runs at the END of
    // this function, AFTER the tracker projection below. Without this
    // explicit update, every projection reads last frame's (or, on the
    // very first frame, an untouched identity) matrix, which is exactly
    // what produced wildly-off marker positions: the camera's translation
    // was missing entirely from the projection.
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld();

    const points: TrackingPointScreen[] = trackerAnchors.map(({ def, anchor }) => {
      anchor.getWorldPosition(projected);
      projected.project(camera);
      return {
        id: def.id,
        label: def.label,
        x: projected.x * halfW() + halfW(),
        y: -projected.y * halfH() + halfH(),
      };
    });
    onFrame(points);

    renderer.render(scene, camera);
  }
  frame();

  return {
    setDesktopOffset,
    updateUniforms,
    resize,
    dispose() {
      disposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', handlePointerMove);
      particleGeometry.dispose();
      particleMaterial.dispose();
      torusRing.geometry.dispose();
      (torusRing.material as THREE.Material).dispose();
      dottedRing.geometry.dispose();
      (dottedRing.material as THREE.Material).dispose();
      dashedRingGeometry.dispose();
      dashedRingMaterial.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    },
  };
}
