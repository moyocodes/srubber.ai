import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const small = typeof matchMedia === 'function' && matchMedia('(max-width: 640px)').matches;
const COUNT = small ? 1400 : 3200;
const MAX_DIRT = 0.22; // at most this share of the galaxy turns into "dirt"
const CATS = ['invisible', 'bidi', 'space', 'homoglyph'];
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// Differential rotation in the vertex shader: inner stars orbit faster. Dirt jitters in its category colour
// until the scrub wave (a ring moving outward from the centre) passes it and turns it mint, then back to dust.
const vert = /* glsl */ `
  uniform float uSpin, uTime, uEnergy, uScrub, uPulse, uDirt, uPx;
  uniform vec4 uCum;
  uniform vec3 uCat[4], uBrand;
  attribute vec3 aBase;   // radius, angle, height
  attribute vec3 aColor;
  attribute vec2 aSeed;   // rank for dirt, random
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float r = aBase.x, rn = (r - 2.0) / 10.0;
    float a = aBase.y + uSpin / sqrt(r);
    float wob = sin(uTime * (0.6 + aSeed.y) + aSeed.y * 40.0) * (0.06 + uEnergy * 0.25);
    vec3 p = vec3(cos(a) * r, aBase.z + wob, sin(a) * r);
    p *= 1.0 + uPulse * (1.0 - rn) * 0.35;

    vec3 col = aColor; float size = 1.0 + aSeed.y * 1.4; float alpha = 0.28;
    if (aSeed.x < uDirt) {
      float k = aSeed.x / max(uDirt, 1e-4);
      vec3 dirt = k < uCum.x ? uCat[0] : k < uCum.y ? uCat[1] : k < uCum.z ? uCat[2] : uCat[3];
      float front = uScrub * 1.3 - 0.15;
      float washed = smoothstep(front, front - 0.12, rn);          // 1 once the wave has passed
      float flash = smoothstep(0.14, 0.0, abs(rn - front));         // bright where the wave is
      p += vec3(sin(uTime * 9.0 + aSeed.y * 70.0), cos(uTime * 11.0 + aSeed.y * 50.0), 0.0) * 0.06 * (1.0 - washed);
      col = mix(dirt, mix(uBrand, aColor, smoothstep(0.0, 0.5, uScrub - rn)), washed);
      size *= 1.0 + 1.2 * (1.0 - washed) + flash * 1.5;
      alpha = mix(0.7, 0.28, washed) + flash * 0.3;
    }
    vColor = col; vAlpha = alpha;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = size * uPx * (32.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const frag = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = pow(smoothstep(0.5, 0.0, d), 1.6) * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor, a);
  }`;

function Galaxy({ energy, dirt, burst, theme }) {
  const ref = useRef();
  const state = useRef({ spin: 0, scrub: 1, scrubAt: -1, pulse: 0 });

  const geometry = useMemo(() => {
    const base = new Float32Array(COUNT * 3), color = new Float32Array(COUNT * 3), seed = new Float32Array(COUNT * 2);
    for (let i = 0; i < COUNT; i++) {
      const arm = i % 3, r = 2 + Math.pow(Math.random(), 0.8) * 10;
      base[i * 3] = r;
      base[i * 3 + 1] = arm * (Math.PI * 2 / 3) + r * 0.45 + (Math.random() - 0.5) * (0.9 + r * 0.05);
      base[i * 3 + 2] = (Math.random() - 0.5) * (0.5 + r * 0.06);
      seed[i * 2] = Math.random(); seed[i * 2 + 1] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
    g.setAttribute('aBase', new THREE.BufferAttribute(base, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 2));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 20);
    return g;
  }, []);

  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false,
    uniforms: {
      uSpin: { value: 0 }, uTime: { value: 0 }, uEnergy: { value: 0 }, uScrub: { value: 1 }, uPulse: { value: 0 }, uDirt: { value: 0 },
      uPx: { value: Math.min(window.devicePixelRatio || 1, 1.5) }, uCum: { value: new THREE.Vector4(1, 1, 1, 1) },
      uCat: { value: CATS.map(() => new THREE.Color()) }, uBrand: { value: new THREE.Color() }
    }
  }), []);

  // Colours follow the theme: glowing additive dust on dark, soft ink-tinted dust on light
  useEffect(() => {
    const wheel = ['--brand', '--space', '--homo', '--bidi', '--invisible', '--stem', '--fg', '--fg'].map(v => new THREE.Color(css(v)));
    const col = geometry.attributes.aColor;
    for (let i = 0; i < COUNT; i++) {
      const c = wheel[Math.floor(Math.random() * wheel.length)].clone().lerp(wheel[6], 0.35);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
    material.uniforms.uCat.value.forEach((c, i) => c.set(css(['--invisible', '--bidi', '--space', '--homo'][i])));
    material.uniforms.uBrand.value.set(css('--brand'));
    material.blending = theme === 'light' ? THREE.NormalBlending : THREE.AdditiveBlending;
    material.needsUpdate = true;
  }, [theme, geometry, material]);

  // New hidden characters: show them as dirt for a moment, then sweep them clean
  const total = CATS.reduce((a, k) => a + (dirt[k] || 0), 0);
  useEffect(() => {
    const u = material.uniforms;
    u.uDirt.value = total ? Math.min(MAX_DIRT, 0.02 + total / 600) : 0;
    let acc = 0;
    const cum = CATS.map(k => (acc += (dirt[k] || 0) / Math.max(total, 1)));
    u.uCum.value.set(cum[0], cum[1], cum[2], 1);
    if (total) { state.current.scrub = 0; state.current.scrubAt = performance.now() + 900; }
  }, [total, dirt.invisible, dirt.bidi, dirt.space, dirt.homoglyph, material]);

  useEffect(() => { if (burst) state.current.pulse = 1; }, [burst]);

  useFrame(({ pointer, clock }, dt) => {
    const s = state.current, u = material.uniforms, g = ref.current;
    if (still) { u.uScrub.value = 1; return; }
    s.spin += dt * (0.12 + energy * 0.5);
    if (s.scrubAt > 0 && performance.now() > s.scrubAt) s.scrub = Math.min(1, s.scrub + dt / 2.2);
    s.pulse *= Math.pow(0.04, dt);
    u.uSpin.value = s.spin; u.uTime.value = clock.elapsedTime; u.uEnergy.value += (energy - u.uEnergy.value) * Math.min(1, dt * 2);
    u.uScrub.value = s.scrub; u.uPulse.value = s.pulse;
    if (g) {
      g.rotation.x += (0.95 + pointer.y * 0.25 - g.rotation.x) * Math.min(1, dt * 2);
      g.rotation.z += (pointer.x * -0.25 - g.rotation.z) * Math.min(1, dt * 2);
    }
  });

  return <points ref={ref} geometry={geometry} material={material} rotation={[0.95, 0, 0]} />;
}

export default function Scene({ energy = 0, dirt = {}, burst = 0, theme = 'dark' }) {
  return (
    <div className="scene-mask pointer-events-none fixed inset-0 -z-10 opacity-35 sm:opacity-100 sm:dark:opacity-70" aria-hidden="true">
      <Canvas camera={{ position: [0, 1.5, 14], fov: 50 }} dpr={[1, 1.5]} frameloop={still ? 'demand' : 'always'} gl={{ alpha: true, antialias: false, powerPreference: 'low-power' }}
        onCreated={({ camera }) => camera.lookAt(0, 2.5, 0)}>
        <Galaxy energy={energy} dirt={dirt} burst={burst} theme={theme} />
      </Canvas>
    </div>
  );
}
