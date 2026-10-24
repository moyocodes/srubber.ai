import { useEffect } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';

// The things the cleaner removes, drifting in the page gutters. Every few seconds one gets wiped
// by a mint stroke, turns into a tick, then comes back dirty. Nearer chips (higher z) move more with the pointer.
const ICONS = [
  { t: 'ZWSP', c: '--invisible', x: '6%', y: '18%', z: 1.0, d: 0 },
  { t: '**', c: '--stem', x: '13%', y: '42%', z: 0.6, d: 2.2 },
  { t: '—', c: '--space', x: '4%', y: '66%', z: 0.8, d: 4.1 },
  { t: 'cite', c: '--invisible', x: '15%', y: '84%', z: 0.5, d: 6.3 },
  { t: '#', c: '--homo', x: '90%', y: '14%', z: 0.7, d: 1.1 },
  { t: '“ ”', c: '--bidi', x: '84%', y: '36%', z: 1.0, d: 3.3 },
  { t: 'NBSP', c: '--space', x: '93%', y: '58%', z: 0.55, d: 5.2 },
  { t: '¶', c: '--brand', x: '86%', y: '80%', z: 0.85, d: 7.4 },
  { t: 'RLO', c: '--bidi', x: '24%', y: '6%', z: 0.4, d: 8.6 },
  { t: 'аe', c: '--homo', x: '76%', y: '93%', z: 0.45, d: 9.7 }
];
const CYCLE = 11; // seconds between wipes of the same chip

function Chip({ icon, px, py }) {
  const x = useTransform(px, v => v * 40 * icon.z), y = useTransform(py, v => v * 30 * icon.z);
  return (
    <motion.div style={{ left: icon.x, top: icon.y, x, y, scale: 0.75 + icon.z * 0.35, opacity: 0.12 + icon.z * 0.22 }} className="absolute">
      <motion.div animate={{ y: [0, -14, 0, 10, 0], rotate: [-4, 3, -2, 4, -4] }} transition={{ duration: 9 + icon.z * 6, repeat: Infinity, ease: 'easeInOut', delay: icon.d * 0.3 }}
        className="relative overflow-hidden rounded-xl px-3 py-1.5 font-mono text-[13px] font-medium ring-1 backdrop-blur-sm"
        style={{ color: `var(${icon.c})`, background: `color-mix(in oklab, var(${icon.c}) 10%, transparent)`, '--tw-ring-color': `color-mix(in oklab, var(${icon.c}) 30%, transparent)` }}>
        <motion.span className="block" animate={{ opacity: [1, 1, 0, 0, 1] }} transition={{ duration: CYCLE, times: [0, 0.1, 0.16, 0.34, 0.4], repeat: Infinity, delay: icon.d }}>{icon.t}</motion.span>
        <motion.span className="absolute inset-0 grid place-items-center text-brand" animate={{ opacity: [0, 0, 1, 1, 0], scale: [0.6, 0.6, 1, 1, 0.6] }} transition={{ duration: CYCLE, times: [0, 0.12, 0.18, 0.32, 0.38], repeat: Infinity, delay: icon.d }}>✓</motion.span>
        <motion.i className="absolute inset-y-0 left-0 w-full origin-left bg-brand/40" animate={{ scaleX: [0, 0, 1, 1, 0], opacity: [0, 0, 1, 0, 0] }} transition={{ duration: CYCLE, times: [0, 0.08, 0.15, 0.22, 0.3], repeat: Infinity, delay: icon.d }} />
      </motion.div>
    </motion.div>
  );
}

export function FloatIcons() {
  const mx = useMotionValue(0), my = useMotionValue(0);
  const px = useSpring(mx, { stiffness: 40, damping: 18 }), py = useSpring(my, { stiffness: 40, damping: 18 });
  useEffect(() => {
    const move = e => { mx.set(e.clientX / innerWidth - 0.5); my.set(e.clientY / innerHeight - 0.5); };
    addEventListener('pointermove', move, { passive: true });
    return () => removeEventListener('pointermove', move);
  }, [mx, my]);
  return (
    <div className="pointer-events-none fixed inset-0 -z-[5] overflow-hidden lg:left-[288px]" aria-hidden="true">
      {ICONS.map((icon, i) => <div key={icon.t} className={i > 5 ? 'hidden sm:block' : 'max-sm:opacity-50'}><Chip icon={icon} px={px} py={py} /></div>)}
    </div>
  );
}
