import { Component, Fragment, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { analyze, clean, formatting, hex } from './lib/text.js';
import { diffWords } from './lib/diff.js';
import { aiCheck } from './lib/aiCheck.js';
import { SAMPLE } from './lib/sample.js';
import { request, walletId, setWallet, naira } from './lib/api.js';
import { Logo } from './Logo.jsx';
import { FloatIcons } from './FloatIcons.jsx';
import { Engine } from './Engine.jsx';
import { Mascot } from './Mascot.jsx';
import { ScrollProgress, StageRail, Stage, useActiveStage, ScrollCue, NextCue } from './Flow.jsx';

// The story's stages, in scroll order. Keep ids stable: the rail and the active-stage observer key off them.
// label shows in the rail; step/title/blurb describe the stage itself and power the "next" prompt
// shown at the foot of the PREVIOUS stage (via nextOf), so each descriptor lives on its own stage.
const STAGES = [
  { id: 'paste', label: 'Paste', step: '01', title: 'Paste your text', blurb: 'From ChatGPT, Claude, Gemini, a PDF or a Word doc' },
  { id: 'reveal', label: "What's hidden", step: '02', title: 'See what\'s hidden', blurb: 'The invisible characters, direction marks and tags, revealed' },
  { id: 'clean', label: 'Clean result', step: '03', title: 'Get the clean version', blurb: 'The same text with every hidden mark and stray format removed' },
  { id: 'score', label: 'AI-style score', step: '04', title: 'Check the AI-style score', blurb: 'A local read on phrases that sound AI-written' },
  { id: 'edit', label: 'AI edits', step: '05', title: 'Polish it with Claude', blurb: 'Optional suggested edits and a full rewrite in your voice' },
  { id: 'engine', label: 'How it works', step: '06', title: 'See how it works', blurb: 'The nine cleaning passes, run on your device in milliseconds' },
];
const nextOf = id => { const i = STAGES.findIndex(s => s.id === id); return STAGES[i + 1] || STAGES[i]; };

const Scene = lazy(() => import('./Scene.jsx'));

const OPTS = {
  always: [
    ['invisible', 'Invisible characters', 'Zero-width spaces and joiners, BOM, soft hyphens, tag and control characters'],
    ['bidi', 'Direction marks', 'Left-to-right / right-to-left marks and overrides'],
    ['space', 'Unusual spaces', 'Non-breaking, thin, narrow and other odd spaces become a normal space'],
    ['homoglyph', 'Look-alike letters', 'Cyrillic or Greek letters hiding in English words, and 𝐬𝐭𝐲𝐥𝐞𝐝 or ｆｕｌｌｗｉｄｔｈ letters']
  ],
  optional: [
    ['dashes', 'Em dashes', 'Rewritten the way a person would type them. Ranges like 2020–2025 get a hyphen.'],
    ['markdown', 'Markdown', 'Headings, **bold**, bullets, links, tables, quotes and code fences become plain text. Code itself is left alone.'],
    ['cite', 'AI citation leftovers', 'ChatGPT markers like citeturn0search0, 【4:0†source】 and ?utm_source=chatgpt.com on links'],
    ['quotes', 'Straight quotes', '“ ” ‘ ’ become " and \', … becomes ...'],
    ['emoji', 'Emoji', '🚀 ✅ and other emoji AI tools use as bullet points'],
    ['tidy', 'Tidy whitespace', 'Trailing spaces, doubled spaces, runs of blank lines']
  ]
};
const DEFAULT_OPTS = { invisible: true, bidi: true, space: true, homoglyph: true, dashes: true, dashStyle: 'smart', markdown: true, cite: true, quotes: false, emoji: false, tidy: true };
const BASIC = { invisible: 1, bidi: 1, space: 1, homoglyph: 1, tidy: 1 };
const CHIP = { invisible: ['invisible character', 'invisible characters'], bidi: ['direction mark', 'direction marks'], space: ['unusual space', 'unusual spaces'], homoglyph: ['look-alike letter', 'look-alike letters'] };
const FMT = { dashes: ['em dash', 'em dashes'], markdown: ['Markdown mark', 'Markdown marks'], cite: ['AI citation leftover', 'AI citation leftovers'], quotes: ['curly quote', 'curly quotes'], emoji: ['emoji', 'emoji'] };
const TINT = { invisible: 'bg-invisible-bg text-invisible', bidi: 'bg-bidi-bg text-bidi', space: 'bg-space-bg text-space', homoglyph: 'bg-homo-bg text-homo' };
const GOALS = [['natural', 'Natural'], ['simple', 'Simpler'], ['formal', 'Formal'], ['short', 'Shorter'], ['warm', 'Warmer']];
const ACTION = { suggest: 'Suggested edits', rephrase: 'Rephrase' };
// One-tap rules shown right above the cleaned text; the full list lives in the Cleaning rules sheet
const QUICK = [['dashes', 'Em dashes'], ['markdown', 'Markdown'], ['cite', 'AI citations'], ['quotes', 'Straight quotes'], ['emoji', 'Emoji'], ['tidy', 'Whitespace']];
const MIN_WORDS_AUTO = 25;
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const load = (key, fallback) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } };
const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} };
const day = d => d ? new Date(d + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'the 1st';
const ago = t => {
  const s = Math.round((Date.now() - t) / 1000);
  return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`;
};
const titleOf = t => (t.replace(/[#*_>`]/g, '').trim().split('\n')[0] || 'Untitled').slice(0, 48);

// The example shows on the first visit only, so returning users can paste straight away. Read once at load.
const FIRST_VISIT = (() => {
  try { const seen = localStorage.getItem('scrubber-seen') === '1'; localStorage.setItem('scrubber-seen', '1'); return !seen; } catch (e) { return false; }
})();

// ---------- small pieces ----------

class Boundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

const I = {
  copy: 'M9 9h10v10H9zM5 15V5h10',
  check: 'M5 12l5 5L20 7',
  sliders: 'M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6',
  sun: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  paste: 'M9 4h6v3H9zM7 5H5v16h14V5h-2',
  x: 'M6 6l12 12M18 6 6 18',
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z',
  undo: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  plus: 'M12 5v14M5 12h14',
  menu: 'M4 7h16M4 12h16M4 17h10',
  doc: 'M7 3h7l5 5v13H7zM14 3v5h5',
  pen: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  list: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  panel: 'M4 5h16v14H4zM10 5v14'
};
const Icon = ({ d, className = 'size-[18px]' }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true"><path d={d} /></svg>;
const Spinner = () => <svg viewBox="0 0 24 24" className="size-4 animate-spin" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" /><path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>;

function Btn({ variant = 'ghost', className = '', ...p }) {
  const look = { primary: 'bg-accent text-accent-fg hover:opacity-90', ghost: 'bg-raised text-fg hover:bg-line', outline: 'border border-line text-fg hover:bg-raised', bare: 'text-muted hover:bg-raised hover:text-fg' }[variant];
  return <motion.button whileTap={{ scale: 0.96 }} type="button" className={`inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${look} ${className}`} {...p} />;
}

function Switch({ checked, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={`relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors ${checked ? 'bg-brand' : 'bg-line'}`}>
      <motion.span layout transition={{ type: 'spring', stiffness: 600, damping: 35 }} className={`absolute top-[3px] size-5 rounded-full bg-white shadow ${checked ? 'right-[3px]' : 'left-[3px]'}`} />
    </button>
  );
}

function Segmented({ value, onChange, options, label, className = '' }) {
  return (
    <div role="tablist" aria-label={label} className={`inline-flex rounded-full bg-raised p-1 ${className}`}>
      {options.map(([k, text]) => (
        <button key={k} role="tab" type="button" aria-selected={value === k} onClick={() => onChange(k)} className="relative rounded-full px-3.5 py-1.5 text-[13px] font-medium">
          {value === k && <motion.span layoutId={label} transition={{ type: 'spring', stiffness: 500, damping: 40 }} className="absolute inset-0 rounded-full bg-surface shadow-sm ring-1 ring-line" />}
          <span className={`relative ${value === k ? 'text-fg' : 'text-muted'}`}>{text}</span>
        </button>
      ))}
    </div>
  );
}

function Num({ value }) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, v => Math.round(v));
  useEffect(() => { const c = animate(mv, value, { duration: 0.8, ease: 'easeOut' }); return c.stop; }, [value, mv]);
  return <motion.span>{text}</motion.span>;
}

function Card({ className = '', children, ...p }) {
  return <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className={`min-w-0 rounded-[28px] bg-surface ring-1 ring-line ${className}`} {...p}>{children}</motion.section>;
}

// Bottom sheet on phones, centred dialog on larger screens
function Sheet({ open, onClose, title, children }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} onKeyDown={e => e.key === 'Escape' && onClose()}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
          <motion.div onClick={e => e.stopPropagation()} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 38 }}
            className="grid max-h-[88dvh] w-full gap-4 overflow-auto rounded-t-[28px] bg-surface p-5 pb-[max(20px,env(safe-area-inset-bottom))] ring-1 ring-line sm:max-w-[460px] sm:rounded-[28px] sm:p-6">
            <div className="mx-auto -mt-1 h-1 w-10 rounded-full bg-line sm:hidden" />
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
              <Btn variant="bare" onClick={onClose} className="size-9 !p-0" aria-label="Close"><Icon d={I.x} /></Btn>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Balance, usage log and recent texts. A fixed column on wide screens, a drawer on phones.
// The collapsed rail: icon-only, so the sidebar's information stays one click away without taking up width.
function Toolbar({ account, onNew, onBuy, onRules, onTheme, theme, onExpand }) {
  const usesLeft = account ? account.freeLeft + account.credits : null;
  return (
    <div className="grid h-full grid-rows-[auto_1fr_auto] justify-items-center gap-2 py-3.5">
      <div className="grid justify-items-center gap-2.5">
        <a href="/" aria-label="scrubber.ai" className="grid place-items-center"><Logo size={24} /></a>
        <Btn variant="bare" onClick={onExpand} className="size-9 !p-0" aria-label="Expand sidebar" title="Expand sidebar"><Icon d={I.panel} className="size-4" /></Btn>
        <Btn variant="outline" onClick={onNew} className="size-9 !p-0" aria-label="New text" title="New text"><Icon d={I.plus} className="size-4" /></Btn>
      </div>
      <div className="self-center">
        <button type="button" onClick={onBuy} title="Credits" className="grid justify-items-center gap-0.5 rounded-2xl bg-raised px-1.5 py-2.5 ring-1 ring-line">
          <span className="text-[15px] font-light leading-none tabular-nums">{usesLeft ?? '–'}</span>
          <span className="font-mono text-[8.5px] uppercase tracking-wider text-muted">left</span>
        </button>
      </div>
      <div className="grid justify-items-center gap-1">
        <Btn variant="bare" onClick={onRules} className="size-9 !p-0" aria-label="Cleaning rules" title="Cleaning rules"><Icon d={I.sliders} className="size-4 text-muted" /></Btn>
        <Btn variant="bare" onClick={onTheme} className="size-9 !p-0" aria-label="Toggle theme" title="Toggle theme"><Icon d={theme === 'dark' ? I.sun : I.moon} className="size-4 text-muted" /></Btn>
      </div>
    </div>
  );
}

function Sidebar({ account, usage, recent, onNew, onOpen, onBuy, onRules, onTheme, theme, onClearHistory, activeId, onCollapse }) {
  const free = account?.freeLeft ?? 0, paid = account?.credits ?? 0, total = free + paid;
  const cap = Math.max(total, (account?.freeTotal ?? 20) + (paid ? account?.packUses ?? 10 : 0), 1);
  return (
    // The column itself never scrolls: it's exactly viewport height, laid out in three fixed-size
    // rows (brand+new, credits, footer) around one flexible row (usage+recent) that shares the
    // remaining space and scrolls internally if its own content runs long.
    <div className="grid h-full grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-3 overflow-hidden p-3.5">
      <div className="grid gap-2.5">
        <div className="flex items-center justify-between gap-2 px-1">
          <a href="/" className="flex items-center gap-2.5 text-[16px] font-bold tracking-[-0.02em]"><Logo size={24} /><span>scrubber<span className="text-muted">.ai</span></span></a>
          {onCollapse && <Btn variant="bare" onClick={onCollapse} className="size-8 !p-0 shrink-0" aria-label="Collapse sidebar" title="Collapse sidebar"><Icon d={I.panel} className="size-4" /></Btn>}
        </div>
        <Btn variant="outline" onClick={onNew} className="justify-start !rounded-2xl !py-2"><Icon d={I.plus} className="size-4" />New text</Btn>
      </div>

      <section className="grid gap-2 rounded-2xl bg-raised p-3 ring-1 ring-line" aria-label="Your credits">
        <div className="flex items-baseline justify-between">
          <span className="text-[12px] font-medium text-muted">Credits</span>
          <span className="font-mono text-[10.5px] text-muted">2–3 per action</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-[28px] font-light leading-none tabular-nums"><Num value={total} /></span>
          <span className="text-[12.5px] text-muted">{total === 1 ? 'credit left' : 'credits left'}</span>
        </div>
        <div className="flex h-1.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
          <motion.i className="bg-brand" initial={false} animate={{ width: `${free / cap * 100}%` }} transition={{ duration: 0.6 }} />
          <motion.i className="bg-space" initial={false} animate={{ width: `${paid / cap * 100}%` }} transition={{ duration: 0.6 }} />
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-muted">
          <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-brand" />{free} free · {day(account?.freeResetsOn)}</span>
          <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-space" />{paid} paid</span>
        </div>
        <Btn variant="primary" onClick={onBuy} className="!py-1.5 !text-[13px]">{account ? `Buy ${account.packUses} for ${naira(account.priceNgn)}` : 'Buy credits'}</Btn>
      </section>

      <div className="grid min-h-0 grid-rows-[auto_auto] gap-3 overflow-y-auto">
        <section className="grid content-start gap-1" aria-label="Usage">
          <h3 className="px-1 text-[10.5px] font-medium uppercase tracking-wider text-muted">Usage</h3>
          {usage.length
            ? <ul className="grid">{usage.slice(0, 4).map(u => (
              <li key={u.at} className="flex items-center gap-2 rounded-xl px-1.5 py-1 text-[12.5px]">
                <Icon d={u.kind === 'rephrase' ? I.pen : I.list} className="size-3.5 shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate">{ACTION[u.kind]}<span className="text-muted"> · {ago(u.at)}</span></span>
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[10px] ${!u.paid ? 'bg-brand/10 text-brand' : 'bg-space-bg text-space'}`}>{u.paid ? `−${u.paid}` : `${u.free} free`}</span>
              </li>))}</ul>
            : <p className="px-1 text-[12px] text-muted">No AI actions yet.</p>}
        </section>

        <section className="grid min-h-0 content-start gap-1" aria-label="Recent texts">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[10.5px] font-medium uppercase tracking-wider text-muted">Recent</h3>
            {recent.length > 0 && <button type="button" onClick={onClearHistory} className="text-[10.5px] text-muted hover:text-fg">Clear</button>}
          </div>
          {recent.length
            ? <ul className="grid">{recent.slice(0, 5).map(r => (
              <li key={r.id}><button type="button" onClick={() => onOpen(r)} className={`flex w-full items-center gap-2 rounded-xl px-1.5 py-1 text-left text-[12.5px] transition hover:bg-raised ${r.id === activeId ? 'bg-raised' : ''}`}>
                <Icon d={I.doc} className="size-3.5 shrink-0 text-muted" /><span className="min-w-0 flex-1 truncate">{r.title}</span><span className="shrink-0 text-[10.5px] text-muted">{ago(r.at)}</span>
              </button></li>))}</ul>
            : <p className="px-1 text-[12px] text-muted">Cleaned texts show up here, kept in this browser only.</p>}
        </section>
      </div>

      <div className="grid gap-0.5 border-t border-line pt-2">
        <button type="button" onClick={onRules} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-[13px] hover:bg-raised"><Icon d={I.sliders} className="size-4 text-muted" />Cleaning rules</button>
        <button type="button" onClick={onTheme} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-[13px] hover:bg-raised"><Icon d={theme === 'dark' ? I.sun : I.moon} className="size-4 text-muted" />{theme === 'dark' ? 'Light mode' : 'Dark mode'}</button>
        <button type="button" onClick={onBuy} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-[13px] hover:bg-raised"><Icon d={I.receipt} className="size-4 text-muted" />Restore a purchase</button>
      </div>
    </div>
  );
}

// ---------- app ----------

export default function App() {
  const [text, setText] = useState(FIRST_VISIT ? SAMPLE : '');
  const [original, setOriginal] = useState(FIRST_VISIT ? SAMPLE : '');
  const [draftId, setDraftId] = useState(() => Date.now());
  const [opts, setOptsState] = useState(() => ({ ...DEFAULT_OPTS, ...load('scrubber-opts', {}) }));
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark');
  const [view, setView] = useState('clean');
  const [focus, setFocus] = useState('in'); // 'in' = composer has the spotlight, 'out' = the reply does
  const [goal, setGoal] = useState('natural');
  const [rephrased, setRephrased] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [account, setAccount] = useState(null);
  const [usage, setUsage] = useState(() => load('scrubber-usage', []));
  const [recent, setRecent] = useState(() => load('scrubber-recent', []));
  const [busy, setBusy] = useState(null); // 'suggest' | 'rephrase' | null
  const [status, setStatusState] = useState({ msg: '', err: false });
  const [payOpen, setPayOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => load('scrubber-sidebar-collapsed', false));
  const [email, setEmail] = useState('');
  const [restoreRef, setRestoreRef] = useState('');
  const [payBusy, setPayBusy] = useState(false);
  const [payMsg, setPayMsg] = useState({ msg: '', err: false });
  const [toastMsg, setToastMsg] = useState('');
  const [lastOff, setLastOff] = useState(null); // label of the rule just turned off, for the mascot's nudge
  const [copied, setCopied] = useState(false);
  const [burst, setBurst] = useState(0);
  const [report, setReport] = useState(null); // the correction card that pops up after a paste
  const pasted = useRef(false);
  const reportTimer = useRef();
  const ctlRef = useRef(null);
  const toastTimer = useRef();
  const copyTimer = useRef();
  const inRef = useRef(null);

  const setStatus = (msg, err = false) => setStatusState({ msg, err });
  const toast = msg => { setToastMsg(msg); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToastMsg(''), 1800); };
  const setOpts = fn => setOptsState(o => { const next = fn(o); save('scrubber-opts', next); return next; });
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next); document.documentElement.dataset.theme = next;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'dark' ? '#050807' : '#f6f4ee');
    try { localStorage.setItem('scrubber-theme', next); } catch (e) {}
  };
  const toggleSidebar = () => setSidebarCollapsed(v => { save('scrubber-sidebar-collapsed', !v); return !v; });
  const logUse = (kind, charged) => setUsage(u => { const next = [{ kind, ...charged, at: Date.now() }, ...u].slice(0, 30); save('scrubber-usage', next); return next; });
  // Keep the current draft in the recent list, newest first
  const remember = (value = text, id = draftId) => {
    if (!value.trim()) return;
    setRecent(r => { const next = [{ id, title: titleOf(value), text: value, at: Date.now() }, ...r.filter(x => x.id !== id)].slice(0, 12); save('scrubber-recent', next); return next; });
  };

  // Only take a real account object, never an error page or a half-shaped reply
  const takeAccount = a => { if (a && typeof a.credits === 'number' && typeof a.freeLeft === 'number') setAccount(a); };
  const api = async (path, body, signal) => {
    try {
      const data = await request(path, body, signal);
      takeAccount(data.account);
      return data;
    } catch (e) {
      takeAccount(e.data?.account);
      throw e;
    }
  };

  // ---------- derived ----------
  const items = useMemo(() => analyze(text), [text]);
  const [out, ms] = useMemo(() => {
    const t0 = performance.now();
    const s = clean(rephrased !== null ? analyze(rephrased) : items, opts);
    return [s, performance.now() - t0];
  }, [items, rephrased, opts]);
  const counts = useMemo(() => {
    const c = { invisible: 0, bidi: 0, space: 0, homoglyph: 0 };
    items.forEach(({ info }) => { if (info) c[info.cat]++; });
    return c;
  }, [items]);
  const fmt = useMemo(() => formatting(text), [text]);
  const fixed = [...Object.entries(counts).filter(([k, n]) => n && opts[k]), ...Object.entries(fmt).filter(([k, n]) => n && opts[k])].reduce((a, [, n]) => a + n, 0);
  const ops = useMemo(() => diffWords(original, out), [original, out]);
  const changes = ops ? ops.filter(o => o.t === 'chg' && (o.del.trim() || o.ins.trim())).length : 0;
  const ai = useMemo(() => aiCheck(out), [out]);
  const level = ai.score < 20 ? ['text-ok', 'Few AI-style signals', 'var(--ok)'] : ai.score < 50 ? ['text-invisible', 'Some AI-style signals', 'var(--invisible)'] : ['text-bidi', 'Many AI-style signals', 'var(--bidi)'];
  const current = useMemo(() => clean(analyze(text), BASIC), [text]);
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const anyApplied = suggestions.some(s => s.applied);
  const usesLeft = account ? account.freeLeft + account.credits : null;
  const costs = account?.costs || { suggest: 2, rephrase: 2, rephraseLong: 3, longWords: 750 };
  const costOf = kind => kind === 'rephrase' ? (words > costs.longWords ? costs.rephraseLong : costs.rephrase) : costs.suggest;

  // ---------- text ----------
  const newText = (value, id = Date.now()) => {
    ctlRef.current?.abort();
    remember();
    setStatus(''); setSuggestions([]); setRephrased(null); setView('clean'); setFocus('in'); setLastOff(null);
    setDraftId(id); setOriginal(value); setText(value);
  };
  const onInput = e => {
    const value = e.target.value;
    setText(value);
    if (!anyApplied) setOriginal(value);
    if (rephrased !== null) { setRephrased(null); setStatus('Your text changed. Press Rephrase again to rewrite it.'); }
  };
  const undoAll = () => {
    setText(original); setRephrased(null);
    setSuggestions(s => s.map(x => ({ ...x, applied: false })));
    toast('Back to your original');
  };

  // ---------- AI features: every action costs one use, free ones first ----------
  const guard = async (kind, startMsg, work) => {
    if (usesLeft !== null && usesLeft < costOf(kind)) { setStatus(`Not enough credits for this. Your ${account?.freeTotal ?? 20} free credits refill on ${day(account?.freeResetsOn)}, or buy a pack now.`, true); setPayOpen(true); return; }
    ctlRef.current?.abort();
    const ctl = ctlRef.current = new AbortController();
    setBusy(kind); setStatus(startMsg);
    try {
      const data = await work(ctl.signal);
      if (data?.charged) logUse(kind, data.charged);
      remember();
    } catch (e) {
      if (ctl !== ctlRef.current) return;
      if (e.name === 'AbortError') setStatus('Stopped.');
      else if (e.status === 402) { setStatus(`Not enough credits for this. Your ${account?.freeTotal ?? 20} free credits refill on ${day(account?.freeResetsOn)}, or buy a pack now.`, true); setPayOpen(true); }
      else setStatus(e.message, true);
    } finally { if (ctl === ctlRef.current) setBusy(null); }
  };

  const suggest = raw => {
    const t = clean(analyze(raw), BASIC);
    if (!t.trim()) return setStatus('Paste some text first.', true);
    return guard('suggest', 'Reading your text...', async signal => {
      const data = await api('/api/suggest', { wallet: walletId(), text: t, goal }, signal);
      setSuggestions(data.suggestions.map(s => ({ ...s, applied: false })));
      setStatus(data.suggestions.length ? `Found ${plural(data.suggestions.length, 'edit')}.` : 'No changes suggested. Your text reads well.');
      return data;
    });
  };
  const rephrase = () => {
    if (!current) return setStatus('Paste some text first.', true);
    return guard('rephrase', 'Rewriting... this can take up to a minute.', async signal => {
      const data = await api('/api/rephrase', { wallet: walletId(), text: current, goal }, signal);
      setRephrased(data.text);
      setView('clean');
      setStatus('Done. Check the changes before you send it.');
      return data;
    });
  };

  // Auto-suggest on paste only, and only while free uses remain, so it never spends a paid credit unasked
  const autoSuggest = value => { if (value.trim().split(/\s+/).length >= MIN_WORDS_AUTO && account && account.freeLeft > 0) suggest(value); };
  const onPaste = () => { pasted.current = true; setTimeout(() => autoSuggest(inRef.current?.value || ''), 0); };
  const pasteClipboard = async () => {
    try {
      const value = await navigator.clipboard.readText();
      if (!value) return toast('Your clipboard is empty');
      pasted.current = true; newText(value); autoSuggest(value);
    } catch (e) { inRef.current?.focus(); toast('Long-press the box and choose Paste'); }
  };
  const loadSample = () => { pasted.current = true; newText(SAMPLE); };
  const openRecent = r => { newText(r.text, r.id); setNavOpen(false); };
  const startNew = () => { newText(''); setNavOpen(false); setTimeout(() => inRef.current?.focus(), 50); };
  const clearHistory = () => { setRecent([]); setUsage([]); save('scrubber-recent', []); save('scrubber-usage', []); };

  const apply = (s) => {
    setText(current.replace(s.original, () => s.suggestion));
    setSuggestions(list => list.map(x => x === s ? { ...x, applied: true } : x));
  };

  // ---------- payment ----------
  const confirmPayment = async (reference, fromRestore) => {
    if (!reference) return;
    const say = (msg, err = false) => fromRestore ? setPayMsg({ msg, err }) : setStatus(msg, err);
    say('Confirming your payment...');
    try {
      const data = await request('/api/pay/verify?reference=' + encodeURIComponent(reference));
      takeAccount(data.account);
      setWallet(data.wallet);
      const acct = await request('/api/account?wallet=' + data.wallet);
      takeAccount(acct);
      setPayOpen(false);
      toast(data.newlyCredited ? `Payment received. ${acct.packUses} uses added.` : 'Purchase restored.');
      say('');
    } catch (err) { say(err.message, true); }
  };
  const pay = async e => {
    e.preventDefault();
    setPayBusy(true); setPayMsg({ msg: 'Opening Paystack...', err: false });
    try {
      try { sessionStorage.setItem('scrubber-draft', text); } catch (err) {}
      const { url } = await request('/api/pay/start', { wallet: walletId(), email: email.trim() });
      location.href = url;
    } catch (err) { setPayMsg({ msg: err.message, err: true }); setPayBusy(false); }
  };

  useEffect(() => {
    request('/api/account?wallet=' + walletId()).then(takeAccount).catch(() => {});
    // Paystack sends the buyer back to /?reference=...; confirm it, then tidy the address bar
    const params = new URLSearchParams(location.search);
    const ref = params.get('reference') || params.get('trxref');
    if (!ref) return;
    history.replaceState(null, '', location.pathname);
    try {
      const draft = sessionStorage.getItem('scrubber-draft');
      if (draft) { sessionStorage.removeItem('scrubber-draft'); setText(draft); setOriginal(draft); }
    } catch (e) {}
    confirmPayment(ref, false);
  }, []);

  const copy = () => {
    if (!out) return toast('Nothing to copy yet');
    const done = () => { setCopied(true); setBurst(b => b + 1); remember(); clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopied(false), 1600); };
    navigator.clipboard.writeText(out).then(done, () => toast('Press Ctrl+C or ⌘C to copy'));
  };

  // After a paste, pop up what was corrected so the user sees it without scrolling
  useEffect(() => {
    if (!pasted.current) return;
    pasted.current = false;
    const list = [...Object.entries(counts).filter(([k, n]) => n && opts[k]).map(([k, n]) => ({ k, n, label: CHIP[k][n === 1 ? 0 : 1], tint: TINT[k] })),
      ...Object.entries(fmt).filter(([k, n]) => n && opts[k] && FMT[k]).map(([k, n]) => ({ k, n, label: FMT[k][n === 1 ? 0 : 1], tint: 'bg-stem-bg text-stem' }))];
    setReport({ list, total: list.reduce((a, x) => a + x.n, 0), at: Date.now() });
    setFocus('out'); // the reply is what just changed, so give it the spotlight
    clearTimeout(reportTimer.current);
    reportTimer.current = setTimeout(() => setReport(null), 9000);
  }, [text]);
  const seeChanges = () => { setView('changes'); setReport(null); document.querySelector('[aria-label="result-view"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); };

  // Scroll-story stages: which one is centred, and a jump helper for the rail and the "next stage" cues.
  const stageIds = STAGES.map(s => s.id);
  const { active: activeStage, register: registerStage, jump: jumpStage } = useActiveStage(stageIds);
  // Once there's text, the hidden stuff is worth showing, so nudge the reader down into the reveal.
  const scrollToStage = id => jumpStage(id);

  // ---------- render ----------
  const found = Object.entries(counts).filter(([, n]) => n);
  const fmtFound = Object.entries(fmt).filter(([k, n]) => n && FMT[k]);
  const fmtKept = fmtFound.filter(([k]) => !opts[k]); // formatting present but left alone by the current rules
  const R = 34, C = 2 * Math.PI * R;
  const sidebar = <Sidebar account={account} usage={usage} recent={recent} activeId={draftId} theme={theme} onNew={startNew} onOpen={openRecent}
    onBuy={() => { setPayOpen(true); setNavOpen(false); }} onRules={() => { setRulesOpen(true); setNavOpen(false); }} onTheme={toggleTheme} onClearHistory={clearHistory} onCollapse={toggleSidebar} />;
  const toolbar = <Toolbar account={account} theme={theme} onNew={startNew} onBuy={() => setPayOpen(true)} onRules={() => setRulesOpen(true)} onTheme={toggleTheme} onExpand={toggleSidebar} />;
  const railWidth = sidebarCollapsed ? 'w-[76px]' : 'w-[288px]';

  return (
    <MotionConfig reducedMotion="user">
      <div className="backdrop" aria-hidden="true" />
      <Boundary><Suspense fallback={null}><Scene energy={ai.words >= 20 ? ai.score / 100 : 0} dirt={counts} burst={burst} theme={theme} /></Suspense></Boundary>
      <FloatIcons />

      <aside className={`fixed inset-y-0 left-0 z-30 hidden border-r border-line bg-surface/80 backdrop-blur-xl transition-[width] duration-200 lg:block ${railWidth}`} aria-label="Account and history">
        {sidebarCollapsed ? toolbar : sidebar}
      </aside>
      <AnimatePresence>
        {navOpen && (
          <motion.div key="nav" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setNavOpen(false)} className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden">
            <motion.aside onClick={e => e.stopPropagation()} initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', stiffness: 420, damping: 40 }}
              className="h-full w-[min(300px,86vw)] border-r border-line bg-surface pb-[env(safe-area-inset-bottom)]" aria-label="Account and history">{sidebar}</motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={`transition-[padding] duration-200 ${sidebarCollapsed ? 'lg:pl-[76px]' : 'lg:pl-[288px]'}`}>
        <header className="sticky top-0 z-20 border-b border-line/60 bg-bg/70 backdrop-blur-xl lg:hidden">
          <div className="flex h-14 items-center justify-between gap-2 px-3">
            <Btn variant="bare" onClick={() => setNavOpen(true)} className="size-10 !p-0" aria-label="Open menu"><Icon d={I.menu} className="size-5" /></Btn>
            <a href="/" className="flex items-center gap-2 text-[16px] font-bold tracking-[-0.02em]"><Logo size={24} />scrubber<span className="-ml-2 text-muted">.ai</span></a>
            <Btn variant="ghost" onClick={() => setPayOpen(true)} className="!px-3 !py-1.5 text-[13px]" aria-label="Credits">{usesLeft ?? '–'} <span className="font-normal text-muted">uses</span></Btn>
          </div>
        </header>

        <ScrollProgress />
        <StageRail stages={STAGES} active={activeStage} onJump={scrollToStage} offset={sidebarCollapsed ? 76 : 288} />
        <main className="mx-auto w-full px-4 pb-24 motion-safe:sm:[scroll-snap-type:y_proximity]">

          {/* Stage 1 — Hero + paste. The whole reason the reader is here, so it comes first and full-height. */}
          <Stage id="paste" registerRef={registerStage} eager>
            <div className="grid grid-cols-1 gap-5 text-center">
              <div className="grid grid-cols-1 gap-3">
                <h1 className="text-[clamp(38px,8vw,68px)] font-semibold leading-[1.0] tracking-[-0.04em]">Paste AI text.<br />Send <em className="font-serif text-[1.14em] font-normal italic tracking-normal text-brand">clean</em> text.</h1>
                <p className="mx-auto max-w-[52ch] text-[15px] text-muted sm:text-[16px]">Strips hidden characters, Markdown, em dashes and ChatGPT citation leftovers, right in your browser. Nothing is uploaded unless you use an AI action.</p>
              </div>
              <div className="mx-auto w-full max-w-[640px] text-left">
                <motion.div animate={{ scale: focus === 'out' ? 0.98 : 1 }} transition={{ duration: 0.25 }} className="glow-ring is-spotlight min-w-0 rounded-[28px]">
                  <Card className="overflow-hidden bg-raised">
                    <textarea ref={inRef} value={text} onChange={onInput} onFocus={() => setFocus('in')} onPaste={onPaste} spellCheck={false} aria-label="Your text"
                      placeholder="Paste from ChatGPT, Claude, Gemini, a PDF or a Word doc..."
                      className="block max-h-[42vh] min-h-[180px] w-full resize-none bg-transparent px-5 pt-5 text-[16px] leading-[1.6] placeholder:text-muted focus-visible:outline-none" />
                    <div className="flex flex-wrap items-center gap-2 px-3 pb-3 pt-2">
                      {text
                        ? <>
                          <AnimatePresence initial={false}>
                            {found.map(([k, n]) => <motion.span key={k} layout initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className={`rounded-full px-2.5 py-1 text-[12.5px] font-medium tabular-nums ${TINT[k]}`}>{n} {CHIP[k][n === 1 ? 0 : 1]}</motion.span>)}
                            {fmtFound.map(([k, n]) => (
                              <motion.button key={k} layout type="button" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} whileTap={{ scale: 0.94 }} onClick={() => setOpts(o => { const v = !o[k]; if (!v) setLastOff(FMT[k][0]); return { ...o, [k]: v }; })}
                                title={opts[k] ? 'Being cleaned. Tap to keep them.' : 'Being kept. Tap to clean them.'}
                                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12.5px] font-medium tabular-nums ring-1 transition ${opts[k] ? 'bg-stem-bg text-stem ring-stem/30' : 'text-muted line-through ring-line'}`}>
                                {opts[k] && <Icon d={I.check} className="size-3.5" />}{n} {FMT[k][n === 1 ? 0 : 1]}
                              </motion.button>
                            ))}
                            {!found.length && !fmtFound.length && <motion.span key="clean" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-full px-2.5 py-1 text-[12.5px] font-medium text-ok ring-1 ring-ok/40">Nothing hidden found</motion.span>}
                          </AnimatePresence>
                          <span className="ml-auto flex items-center gap-1">
                            <span className="px-1 font-mono text-xs tabular-nums text-muted">{words.toLocaleString()} words</span>
                            <Btn variant="bare" onClick={startNew} className="!px-3 !py-1.5 text-[13px]">Clear</Btn>
                          </span>
                        </>
                        : <>
                          <Btn variant="outline" onClick={pasteClipboard} className="!py-1.5 text-[13px]"><Icon d={I.paste} className="size-4" />Paste</Btn>
                          <Btn variant="outline" onClick={loadSample} className="!py-1.5 text-[13px]">Try an example</Btn>
                        </>}
                    </div>
                  </Card>
                </motion.div>
                {text
                  ? <NextCue step={nextOf('paste').step} title={nextOf('paste').title} blurb={nextOf('paste').blurb} onClick={() => scrollToStage('reveal')} />
                  : <div className="flex justify-center"><ScrollCue label="paste, or scroll to explore" /></div>}
              </div>
            </div>
          </Stage>

          {/* Stage 2 — The reveal: the hidden characters made visible, the drama of the tool. */}
          <Stage id="reveal" step="01" eyebrow="What's hidden" registerRef={registerStage} wide>
            <div className="grid grid-cols-1 gap-3">
              <h2 className="text-[clamp(24px,4.5vw,34px)] font-semibold leading-tight tracking-[-0.03em]">Your text isn't just what you see.</h2>
              <p className="max-w-[58ch] text-[15px] text-muted">Every hidden or swapped character in what you pasted, made visible. Tap a marker for its Unicode name.</p>
              <Card className="mt-2 overflow-hidden">
                <div className="max-h-[52vh] overflow-auto whitespace-pre-wrap break-words p-5 leading-[1.9]">
                  {!text ? <span className="text-sm text-muted">Paste something in the first section and the hidden characters show up here.</span>
                    : items.map(({ c, info }, i) => !info ? c
                      : info.cat === 'homoglyph'
                        ? <mark key={i} title={info.name} className={`cursor-help underline decoration-wavy underline-offset-[3px] ${TINT.homoglyph}`}>{c}</mark>
                        : <Fragment key={i}><mark title={`${hex(c.codePointAt(0))} ${info.name}`} className={`mx-px cursor-help rounded px-1 py-px align-[1px] font-mono text-[10.5px] font-semibold ${TINT[info.cat]}`}>{info.label}</mark>{info.cat === 'space' ? ' ' : ''}</Fragment>)}
                </div>
                {text && (found.length > 0 || fmtFound.length > 0) && (
                  <div className="flex flex-wrap gap-1.5 border-t border-line px-5 py-3">
                    {found.map(([k, n]) => <span key={k} className={`rounded-full px-2.5 py-1 text-[12.5px] font-medium tabular-nums ${TINT[k]}`}>{n} {CHIP[k][n === 1 ? 0 : 1]}</span>)}
                    {fmtFound.map(([k, n]) => <span key={k} className="rounded-full bg-stem-bg px-2.5 py-1 text-[12.5px] font-medium tabular-nums text-stem">{n} {FMT[k][n === 1 ? 0 : 1]}</span>)}
                  </div>
                )}
              </Card>
              <NextCue step={nextOf('reveal').step} title={nextOf('reveal').title} blurb={nextOf('reveal').blurb} onClick={() => scrollToStage('clean')} />
            </div>
          </Stage>

          {/* Stage 3 — The clean result, shown as the reply. The payoff of the reveal. */}
          <Stage id="clean" step="02" eyebrow="Clean result" registerRef={registerStage} wide>
            <div className="grid grid-cols-1 gap-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-[clamp(24px,4.5vw,34px)] font-semibold leading-tight tracking-[-0.03em]">Clean text, ready to send.</h2>
                  <p className="mt-1 text-[15px] text-muted">{fixed ? `${plural(fixed, 'thing')} cleaned` : 'Nothing needed cleaning'} · {Array.from(out).length.toLocaleString()} characters</p>
                </div>
                {text && <Btn variant="primary" onClick={copy}><Icon d={copied ? I.check : I.copy} className="size-4" />{copied ? 'Copied' : 'Copy clean text'}</Btn>}
              </div>
              <Card className="mt-2 overflow-hidden">
                <div className="flex items-center gap-1.5 overflow-x-auto border-b border-line px-4 py-3 [scrollbar-width:none]" aria-label="Quick cleaning rules">
                  <Segmented label="result-view" value={view} onChange={setView} options={[['clean', rephrased !== null ? 'Rephrased' : 'Clean'], ['changes', changes ? `Changes · ${changes}` : 'Changes']]} />
                  <span className="mx-1 h-5 w-px bg-line" />
                  {QUICK.map(([k, label]) => (
                    <motion.button key={k} type="button" role="switch" aria-checked={!!opts[k]} whileTap={{ scale: 0.94 }} onClick={() => setOpts(o => { const v = !o[k]; if (!v) setLastOff(label); return { ...o, [k]: v }; })}
                      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-[12.5px] font-medium ring-1 transition ${opts[k] ? 'bg-brand/10 text-brand ring-brand/30' : 'text-muted ring-line hover:text-fg'}`}>
                      <Icon d={opts[k] ? I.check : I.plus} className="size-3.5" />{label}
                    </motion.button>
                  ))}
                  <button type="button" onClick={() => setRulesOpen(true)} className="ml-auto shrink-0 rounded-full px-3 py-1 text-[12.5px] font-medium text-muted hover:text-fg"><span className="inline-flex items-center gap-1"><Icon d={I.sliders} className="size-3.5" />All rules</span></button>
                </div>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div key={view} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} className="p-5">
                    {view === 'clean'
                      ? <textarea value={out} readOnly spellCheck={false} aria-label="Cleaned text" className="block max-h-[48vh] min-h-[180px] w-full resize-none bg-transparent text-[16px] leading-[1.65] focus-visible:outline-none" />
                      : <div className="max-h-[48vh] overflow-auto whitespace-pre-wrap break-words leading-[1.8]">
                          {!ops ? <span className="text-sm text-muted">This text is too long to compare.</span>
                            : !changes ? <span className="text-sm text-muted">No changes from your original.</span>
                            : ops.map((o, i) => o.t === '=' ? o.x : <Fragment key={i}>{o.del && <del>{o.del}</del>}{o.del && o.ins ? ' ' : ''}{o.ins && <ins>{o.ins}</ins>}</Fragment>)}
                        </div>}
                  </motion.div>
                </AnimatePresence>
              </Card>
              <NextCue step={nextOf('clean').step} title={nextOf('clean').title} blurb={nextOf('clean').blurb} onClick={() => scrollToStage('score')} />
            </div>
          </Stage>

          {/* Stage 4 — AI-style score. */}
          <Stage id="score" step="03" eyebrow="AI-style score" registerRef={registerStage}>
            <Card className="p-6 sm:p-8">
            <h2 className="text-[16px] font-semibold">AI-style estimate</h2>
            <p className="mb-4 text-[13px] text-muted">A local heuristic for phrases AI tools overuse, run on the {rephrased !== null ? 'rephrased' : 'cleaned'} text. It is not GPTZero or Turnitin, and they may score it differently.</p>
            {ai.words < 20
              ? <p className="text-sm text-muted">Paste at least a few sentences to check.</p>
              : <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-start">
                <div className="flex items-center gap-4">
                  <div className="relative size-[84px] shrink-0">
                    <svg viewBox="0 0 80 80" className="size-full -rotate-90"><circle cx="40" cy="40" r={R} fill="none" stroke="var(--line)" strokeWidth="7" /><motion.circle cx="40" cy="40" r={R} fill="none" stroke={level[2]} strokeWidth="7" strokeLinecap="round" strokeDasharray={C} initial={false} animate={{ strokeDashoffset: C * (1 - ai.score / 100) }} transition={{ duration: 0.7, ease: 'easeOut' }} /></svg>
                    <span className={`absolute inset-0 grid place-items-center text-[22px] font-light tabular-nums ${level[0]}`}><span><Num value={ai.score} />%</span></span>
                  </div>
                  <span className={`font-medium sm:hidden ${level[0]}`}>{level[1]}</span>
                </div>
                <div className="grid gap-2">
                  <span className={`hidden font-medium sm:block ${level[0]}`}>{level[1]}</span>
                  <ul className="grid gap-1.5">
                    {ai.found.length
                      ? ai.found.map((f, i) => (
                        <motion.li key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.04, 0.4) }} className="flex min-w-0 items-baseline gap-2.5 text-[14px]">
                          <span className="min-w-[2.6em] font-mono text-xs tabular-nums text-muted">+{f.pts}</span>
                          <span className="min-w-0 break-words">{f.quotes ? <>{f.quotes.map((q, j) => <Fragment key={q}>{j > 0 && ', '}<q className="font-semibold">{q}</q></Fragment>)}{f.repeat ? ` (×${f.repeat})` : ''}: {f.text}</> : f.text}</span>
                        </motion.li>))
                      : <li className="text-[14px]">Nothing flagged. This reads like ordinary writing.</li>}
                  </ul>
                </div>
              </div>}
            </Card>
            <NextCue step={nextOf('score').step} title={nextOf('score').title} blurb={nextOf('score').blurb} onClick={() => scrollToStage('edit')} />
          </Stage>

          {/* Stage 5 — AI edits. The optional, paid step that turns clean text into better text. */}
          <Stage id="edit" step="04" eyebrow="AI edits" registerRef={registerStage}>
          <div className="mb-4 grid gap-2">
            <h2 className="text-[clamp(24px,4.5vw,34px)] font-semibold leading-tight tracking-[-0.03em]">Go further with Claude.</h2>
            <p className="max-w-[56ch] text-[15px] text-muted">Optional. Suggested edits and a full rewrite, in your own voice. Names, dates and numbers are never changed.</p>
          </div>
          <Card className="grid gap-4 p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="flex items-center gap-2 text-[16px] font-semibold"><Icon d={I.spark} className="size-[18px] text-brand" />AI actions</h3>
                <p className="text-[13px] text-muted">By Claude. Credits are shown on each button.</p>
              </div>
              {account && <span className="rounded-full bg-raised px-3 py-1 font-mono text-[12px] tabular-nums text-muted">{usesLeft} left</span>}
            </div>
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]" role="radiogroup" aria-label="Goal">
              {GOALS.map(([k, label]) => (
                <motion.button key={k} type="button" role="radio" aria-checked={goal === k} onClick={() => setGoal(k)} whileTap={{ scale: 0.94 }}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium ring-1 transition ${goal === k ? 'bg-fg text-bg ring-fg' : 'text-muted ring-line hover:text-fg'}`}>{label}</motion.button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <Btn variant="ghost" onClick={() => suggest(text)} disabled={!!busy}>{busy === 'suggest' ? <Spinner /> : <Icon d={I.list} className="size-4" />}Suggest edits <span className="font-mono text-[11px] opacity-60">{costOf('suggest')}</span></Btn>
              <Btn variant="primary" onClick={rephrase} disabled={!!busy}>{busy === 'rephrase' ? <Spinner /> : <Icon d={I.pen} className="size-4" />}Rephrase <span className="font-mono text-[11px] opacity-60">{costOf('rephrase')}</span></Btn>
              {busy && <Btn variant="bare" onClick={() => ctlRef.current?.abort()} className="col-span-2">Stop</Btn>}
            </div>
            {status.msg && <p aria-live="polite" className={`text-[13.5px] ${status.err ? 'text-invisible' : 'text-muted'}`}>{status.msg}</p>}

            {suggestions.length > 0 && (
              <ol className="grid gap-2">
                <AnimatePresence initial={false}>
                  {suggestions.map((s, i) => {
                    const fits = current.includes(s.original), done = s.applied || !fits;
                    return (
                      <motion.li key={s.original + i} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: done ? 0.5 : 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ delay: i * 0.04 }} className="grid min-w-0 gap-1.5 rounded-2xl bg-raised p-4">
                        <span className="break-words text-[14px] text-muted line-through decoration-muted/60">{s.original}</span>
                        <span className="break-words text-[15px]">{s.suggestion}</span>
                        <span className="text-[12.5px] text-muted">{s.applied ? 'Applied.' : !fits ? 'This line has changed, so this suggestion no longer fits.' : s.why}</span>
                        {!done && <span className="mt-1 flex gap-2"><Btn variant="primary" onClick={() => apply(s)} className="!px-3.5 !py-1.5 text-[13px]">Apply</Btn><Btn variant="bare" onClick={() => setSuggestions(l => l.filter(x => x !== s))} className="!px-3.5 !py-1.5 text-[13px]">Skip</Btn></span>}
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ol>
            )}
          </Card>
          <NextCue step={nextOf('edit').step} title={nextOf('edit').title} blurb={nextOf('edit').blurb} onClick={() => scrollToStage('engine')} />
          </Stage>

          {/* Stage 6 — How it works, then the disclaimer to close the story. */}
          <Stage id="engine" step="05" eyebrow="How it works" registerRef={registerStage} wide>
            <Engine counts={counts} fmt={fmt} chars={items.length} ms={ms} opts={opts} />
            <p className="mx-auto mt-10 max-w-[70ch] text-center text-[13px] leading-relaxed text-muted"><strong className="font-medium text-fg">What this does and doesn't do.</strong> Cleaning, the AI-style estimate and the comparison run in your browser, are free, and never send your text anywhere. Your recent texts are kept in this browser only. Suggested edits and Rephrase send your text to Claude, automatically after you paste (while free uses last) or when you press a button. Statistical watermarks such as Google's SynthID are encoded in which words a model chose, so no character cleaner can remove them, and no tool can promise how an AI detector will score a text. If a school or employer asks you to disclose AI use, editing doesn't change that.</p>
          </Stage>
        </main>
      </div>

      {/* Phone: the one thing you came to do stays under your thumb */}
      <AnimatePresence>
        {text && (
          <motion.div initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }} className="fixed inset-x-0 bottom-0 z-20 border-t border-line/60 bg-bg/85 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:hidden">
            <Btn variant="primary" onClick={copy} className="w-full !py-3 text-[15px]"><Icon d={copied ? I.check : I.copy} />{copied ? 'Copied' : rephrased !== null ? 'Copy rephrased text' : 'Copy clean text'}</Btn>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {report && (
          <motion.div key={report.at} role="status" initial={{ opacity: 0, y: 40, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.97 }} transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="fixed inset-x-3 bottom-24 z-[45] mx-auto grid max-w-[440px] gap-3 rounded-[24px] bg-surface p-4 shadow-2xl ring-1 ring-line sm:bottom-6 lg:left-[288px]">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand/15 text-brand"><Icon d={report.total ? I.spark : I.check} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold">{report.total ? `Cleaned ${plural(report.total, 'thing')}` : 'Already clean'}</p>
                <p className="text-[13px] text-muted">{report.total ? 'Your text is ready to copy. Here is what changed:' : 'No hidden characters or AI formatting found.'}</p>
              </div>
              <Btn variant="bare" onClick={() => setReport(null)} className="size-8 !p-0" aria-label="Dismiss"><Icon d={I.x} className="size-4" /></Btn>
            </div>
            {report.total > 0 && <div className="flex flex-wrap gap-1.5">{report.list.map((x, i) => (
              <motion.span key={x.k} initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15 + i * 0.06 }} className={`rounded-full px-2.5 py-1 text-[12.5px] font-medium tabular-nums ${x.tint}`}>{x.n} {x.label}</motion.span>))}</div>}
            <div className="grid grid-cols-2 gap-2">
              <Btn variant="primary" onClick={() => { copy(); setReport(null); }}><Icon d={I.copy} className="size-4" />Copy clean text</Btn>
              <Btn variant="ghost" onClick={seeChanges} disabled={!report.total}>See changes</Btn>
            </div>
            <motion.i key={report.at + 'bar'} className="absolute inset-x-6 bottom-0 h-0.5 origin-left rounded-full bg-brand/60" initial={{ scaleX: 1 }} animate={{ scaleX: 0 }} transition={{ duration: 9, ease: 'linear' }} />
          </motion.div>
        )}
      </AnimatePresence>

      <Mascot fmtFound={fmtKept} lastToggle={lastOff} onOpenRules={() => { setRulesOpen(true); setLastOff(null); }} />

      <AnimatePresence>{toastMsg && <motion.div key="toast" initial={{ opacity: 0, y: 12, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: 12, x: '-50%' }} className="fixed bottom-24 left-1/2 z-[60] rounded-full bg-fg px-4 py-2 text-sm text-bg shadow-lg sm:bottom-6">{toastMsg}</motion.div>}</AnimatePresence>

      <Sheet open={rulesOpen} onClose={() => setRulesOpen(false)} title="Cleaning rules">
        {[['Always on', OPTS.always], ['Formatting', OPTS.optional]].map(([title, list]) => (
          <div key={title} className="grid gap-1">
            <h3 className="px-1 text-xs font-medium uppercase tracking-wider text-muted">{title}</h3>
            <div className="divide-y divide-line overflow-hidden rounded-2xl bg-raised">
              {list.map(([k, label, hint]) => (
                <div key={k} className="grid gap-2 px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <span className="min-w-0"><span className="block text-[15px]">{label}</span><span className="block text-[12.5px] leading-snug text-muted">{hint}</span></span>
                    <Switch checked={!!opts[k]} label={label} onChange={v => setOpts(o => ({ ...o, [k]: v }))} />
                  </div>
                  {k === 'dashes' && opts.dashes && <Segmented label="dash-style" value={opts.dashStyle} onChange={v => setOpts(o => ({ ...o, dashStyle: v }))} options={[['smart', 'Like a person: a, b'], ['hyphen', 'Hyphen: a - b']]} className="justify-self-start" />}
                </div>
              ))}
            </div>
          </div>
        ))}
        <Btn variant="outline" onClick={() => setOpts(() => DEFAULT_OPTS)} className="justify-self-start">Reset to defaults</Btn>
      </Sheet>

      <Sheet open={payOpen} onClose={() => setPayOpen(false)} title={`Buy ${account?.packUses ?? 10} credits for ${account ? naira(account.priceNgn) : '₦500'}`}>
        <p className="text-sm text-muted">Suggested edits use 2 credits and a rephrase 2, or 3 for texts over 750 words. Paid credits never expire, and your free credits refill every month. You pay securely on Paystack with a card, bank transfer or USSD.</p>
        <form onSubmit={pay} className="grid gap-2">
          <label htmlFor="payEmail" className="text-[13.5px] font-medium">Email for your receipt</label>
          <input id="payEmail" type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} className="rounded-2xl bg-raised px-4 py-3 text-base ring-1 ring-line" />
          <Btn variant="primary" type="submit" disabled={payBusy} className="!py-3">{payBusy && <Spinner />}Pay with Paystack</Btn>
        </form>
        <details className="text-sm">
          <summary className="cursor-pointer text-muted underline underline-offset-2">Already paid on another phone or browser?</summary>
          <form onSubmit={e => { e.preventDefault(); confirmPayment(restoreRef.trim(), true); }} className="mt-3 grid gap-2">
            <label htmlFor="restoreRef" className="text-[13.5px] font-medium">Paystack reference from your receipt email</label>
            <input id="restoreRef" required autoComplete="off" placeholder="e.g. T123456789012345" value={restoreRef} onChange={e => setRestoreRef(e.target.value)} className="rounded-2xl bg-raised px-4 py-3 text-base ring-1 ring-line" />
            <Btn variant="outline" type="submit">Restore purchase</Btn>
          </form>
        </details>
        {payMsg.msg && <p aria-live="polite" className={`text-sm ${payMsg.err ? 'text-invisible' : 'text-muted'}`}>{payMsg.msg}</p>}
      </Sheet>
    </MotionConfig>
  );
}
