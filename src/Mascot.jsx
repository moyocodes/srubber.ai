import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

// A small on-screen character that peeks in to point at Cleaning rules when there is something
// worth adjusting: formatting the current rules leave in place, or a rule the user just turned off.
const LINES = {
  kept: n => `I'm keeping ${n} formatting ${n === 1 ? 'thing' : 'things'} your rules say to leave alone. Want to change that?`,
  off: label => `You turned off ${label}. I'll leave those as they are.`,
  idle: 'Not sure what I clean? Check your rules any time.'
};

export function Mascot({ fmtFound, lastToggle, onOpenRules }) {
  const [dismissed, setDismissed] = useState(false);
  const [show, setShow] = useState(false);
  const keptCount = fmtFound.filter(([k]) => k).length;

  useEffect(() => {
    if (dismissed) return;
    const t = setTimeout(() => setShow(true), lastToggle ? 300 : 3200);
    return () => clearTimeout(t);
  }, [keptCount, lastToggle, dismissed]);

  if (!show || dismissed || (!keptCount && !lastToggle)) return null;
  const msg = lastToggle ? LINES.off(lastToggle) : LINES.kept(keptCount);

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0, y: 10, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ type: 'spring', stiffness: 420, damping: 28 }}
        className="pointer-events-auto fixed bottom-24 right-4 z-[42] grid max-w-[260px] gap-2 rounded-[20px] rounded-br-md bg-surface p-3.5 shadow-xl ring-1 ring-line sm:bottom-6">
        <div className="flex items-start gap-2.5">
          <motion.span animate={{ rotate: [-6, 6, -6] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }} className="grid size-8 shrink-0 place-items-center rounded-full bg-stem-bg text-stem">
            <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8" /><path d="M9 10h.01M15 10h.01M9 15c1 1 5 1 6 0" /></svg>
          </motion.span>
          <p className="pt-1 text-[13px] leading-snug">{msg}</p>
          <button type="button" onClick={() => setDismissed(true)} className="-mr-1 -mt-1 shrink-0 rounded-full p-1 text-muted hover:text-fg" aria-label="Dismiss">
            <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <button type="button" onClick={() => { onOpenRules(); setDismissed(true); }} className="justify-self-start rounded-full bg-stem-bg px-3 py-1 text-[12.5px] font-medium text-stem hover:opacity-80">Open cleaning rules</button>
      </motion.div>
    </AnimatePresence>
  );
}
