import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useSpring, useTransform } from 'framer-motion';

// Scroll-driven story scaffolding: each stage of the tool is a full-height section the reader
// scrolls through, like a narrative. A left rail shows where you are and lets you jump between stages.

// A thin progress bar pinned to the top, filling as you move down the whole page.
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const width = useSpring(scrollYProgress, { stiffness: 120, damping: 30, restDelta: 0.001 });
  return <motion.div className="fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-brand" style={{ scaleX: width }} aria-hidden="true" />;
}

// The vertical "you are here" rail: one dot per stage. Observes which section is centred and
// marks it active; clicking a dot scrolls to that stage.
export function StageRail({ stages, active, onJump, offset = 0 }) {
  return (
    <nav aria-label="Stages" style={{ left: `calc(${offset}px + 1.25rem)` }} className="fixed top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-3 2xl:flex">
      {stages.map((s, i) => (
        <button key={s.id} type="button" onClick={() => onJump(s.id)} className="group flex items-center gap-3" aria-current={active === i ? 'step' : undefined}>
          <span className={`grid size-2.5 place-items-center rounded-full ring-1 transition-all ${active === i ? 'scale-125 bg-brand ring-brand' : 'bg-transparent ring-muted/50 group-hover:ring-fg'}`} />
          <span className={`whitespace-nowrap text-[12px] font-medium transition-all ${active === i ? 'text-fg opacity-100' : 'text-muted opacity-0 group-hover:opacity-100'}`}>{s.label}</span>
        </button>
      ))}
    </nav>
  );
}

// One stage of the story. It takes at least the viewport height, centres its content, and the number
// + eyebrow fade/slide in when the stage scrolls into view.
export function Stage({ id, step, eyebrow, wide, children, registerRef, eager }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) registerRef(id, ref.current); }, [id, registerRef]);
  // The first stage is visible on load, so it animates in immediately instead of waiting for scroll.
  const anim = eager ? { animate: { opacity: 1, y: 0 } } : { whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: 0.2, margin: '-8% 0px -8% 0px' } };
  return (
    <section ref={ref} id={id} data-stage={id} className="flex min-h-[100svh] w-full scroll-mt-4 flex-col justify-center py-16 first:min-h-0 first:pt-8 motion-safe:sm:[scroll-snap-align:start] sm:py-20">
      <motion.div initial={{ opacity: 0, y: 28 }} {...anim} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className={`mx-auto w-full min-w-0 ${wide ? 'max-w-[1120px]' : 'max-w-[760px]'}`}>
        {(step || eyebrow) && (
          <div className="mb-4 flex items-center gap-3">
            {step && <span className="grid size-7 place-items-center rounded-full bg-brand/15 font-mono text-[12px] font-semibold text-brand">{step}</span>}
            {eyebrow && <span className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted">{eyebrow}</span>}
          </div>
        )}
        {children}
      </motion.div>
    </section>
  );
}

// Tracks which registered stage is nearest the centre of the viewport, for the rail's active dot.
export function useActiveStage(ids) {
  const [active, setActive] = useState(0);
  const refs = useRef(new Map());
  const register = (id, el) => { refs.current.set(id, el); };
  useEffect(() => {
    const io = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            const i = ids.indexOf(e.target.id);
            if (i >= 0) setActive(i);
          }
        });
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 }
    );
    refs.current.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [ids.join(',')]);
  const jump = id => refs.current.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return { active, register, jump };
}

// The "keep going" prompt at the foot of a stage: it names the next step and what it does, so the
// reader has a reason to scroll on. Clicking it jumps to that stage.
export function NextCue({ step, title, blurb, onClick }) {
  return (
    <motion.button type="button" onClick={onClick} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.6 }} transition={{ duration: 0.4, delay: 0.2 }} whileHover={{ y: 2 }}
      className="group mx-auto mt-10 flex w-full max-w-[460px] items-center gap-3 rounded-2xl bg-surface/70 p-3 pr-4 text-left ring-1 ring-line backdrop-blur-md transition hover:ring-brand/40">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/12 font-mono text-[12px] font-semibold text-brand">{step}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-muted">Next</span>
        <span className="block truncate text-[14px] font-semibold">{title}</span>
        <span className="block truncate text-[12.5px] text-muted">{blurb}</span>
      </span>
      <motion.svg animate={{ y: [0, 4, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }} viewBox="0 0 24 24" className="size-5 shrink-0 text-muted transition group-hover:text-brand" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M6 13l6 6 6-6" /></motion.svg>
    </motion.button>
  );
}

// A soft down-arrow cue that invites the first scroll; hides itself once the reader has moved.
export function ScrollCue({ label = 'Scroll' }) {
  const { scrollY } = useScroll();
  const opacity = useTransform(scrollY, [0, 160], [1, 0]);
  return (
    <motion.div style={{ opacity }} className="pointer-events-none mt-10 flex flex-col items-center gap-1 text-muted" aria-hidden="true">
      <span className="font-mono text-[11px] uppercase tracking-[0.2em]">{label}</span>
      <motion.svg animate={{ y: [0, 6, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }} viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M6 13l6 6 6-6" /></motion.svg>
    </motion.div>
  );
}
