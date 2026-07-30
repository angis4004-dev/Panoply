/**
 * Particle-globe shaders.
 *
 * The design spec asked for "the exact custom GLSL shaders provided" for
 * simplex-noise vertex displacement and soft-circle point rendering, but no
 * shader source actually accompanied the spec - only a description of the
 * intended effect. What's here is a standard, widely-used, MIT-licensed 3D
 * simplex noise implementation (Ashima Arts / Ian McEwan - the de facto
 * reference implementation used across the WebGL ecosystem for exactly this
 * purpose) driving a vertex displacement + soft-circle point fragment shader
 * that reproduces the described behavior, not a transcription of unseen code.
 */

export const simplexNoise3D = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

export const particleVertexShader = /* glsl */ `
uniform float uTime;
uniform float uDistortion;
uniform float uSize;
uniform float uSpread;

varying float vDistortion;

${simplexNoise3D}

void main() {
  // uSpread widens the noise sampling frequency - a tighter frequency (low
  // uSpread) reads as smooth, slow-rolling waves; a wide one breaks the
  // surface into busier, more granular detail.
  float freq = 0.35 + uSpread * 1.2;
  float n = snoise(position * freq + vec3(0.0, 0.0, uTime * 0.15));

  vec3 displaced = position + normal * n * uDistortion;
  vDistortion = n;

  vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
  gl_PointSize = uSize * 6.0 * (300.0 / -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const particleFragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform float uRiskTolerance;
uniform float uOpacity;
varying float vDistortion;

void main() {
  // Soft circular point sprite: solid core, feathered edge, rather than a
  // hard square (the default for gl_PointCoord-less point rendering).
  float d = length(gl_PointCoord - vec2(0.5));
  float alpha = smoothstep(0.5, 0.15, d);
  if (alpha < 0.02) discard;

  // Risk Tolerance widens the brightness swing driven by the noise field -
  // a "calm" (low) setting reads as a steady, evenly-lit surface; a "risk-on"
  // (high) setting makes the noise-lit peaks and troughs visibly shimmer.
  vec3 color = uColor + vDistortion * (0.08 + uRiskTolerance * 0.35);
  gl_FragColor = vec4(color, alpha * uOpacity);
}
`;
