import { motion } from 'framer-motion';

// A chat bubble on a 48×48 grid, stroked through the colour wheel. Its text lines wipe clean in turn and a sparkle pops.
const BUBBLE = 'M16 9h16a9 9 0 0 1 9 9v8a9 9 0 0 1-9 9H19.5L12 41v-6.6A9 9 0 0 1 7 26v-8a9 9 0 0 1 9-9z';
const LINES = ['M15 19h15', 'M15 25.5h9'];
const SPARKLE = 'M39 3.5c.7 3.9 2.6 5.8 6.5 6.5-3.9.7-5.8 2.6-6.5 6.5-.7-3.9-2.6-5.8-6.5-6.5 3.9-.7 5.8-2.6 6.5-6.5z';
const WHEEL = ['--brand', '--space', '--homo', '--bidi', '--invisible', '--stem'];

export function Logo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="scrubber.ai" className="overflow-visible">
      <defs>
        <linearGradient id="logo-wheel" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          {WHEEL.map((v, i) => <stop key={v} offset={i / (WHEEL.length - 1)} style={{ stopColor: `var(${v})` }} />)}
        </linearGradient>
      </defs>
      <g fill="none" stroke="url(#logo-wheel)" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round">
        <path d={BUBBLE} />
        {LINES.map((d, i) => (
          <motion.path key={d} d={d} animate={{ pathLength: [1, 0, 0, 1] }} transition={{ duration: 4, times: [0, 0.15, 0.3, 0.5], delay: i * 0.25, repeat: Infinity, repeatDelay: 1 }} />
        ))}
      </g>
      <motion.path d={SPARKLE} fill="var(--brand)" stroke="var(--bg)" strokeWidth={2} paintOrder="stroke" style={{ originX: 0.5, originY: 0.5 }}
        animate={{ scale: [1, 1, 1.35, 1], rotate: [0, 0, 45, 90] }} transition={{ duration: 5, times: [0, 0.45, 0.55, 0.7], repeat: Infinity }} />
    </svg>
  );
}
