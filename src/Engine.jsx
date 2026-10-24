import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

// How the cleaner works, pass by pass, with what each pass caught in the current text.
// The order matches clean() in lib/text.js: characters first, then code is shielded, then formatting passes.
// ex: [before, after]; ⟨…⟩ marks a character you would not otherwise see.
const PASSES = [
  { k: 'scan', c: '--brand', name: 'Read every code point', short: 'Checks each character against 70+ hidden ones.', how: 'Text is split into Unicode code points, not UTF-16 units, so emoji and rare scripts are never cut in half.', ex: ['Hi there', 'Hi⟨ZWSP⟩ there'], lab: ['looks', 'really'] },
  { k: 'invisible', c: '--invisible', name: 'Invisible characters', short: 'Zero-width spaces, BOMs, soft hyphens, tags.', how: 'Also control and private-use characters, and tag characters used to hide prompts. Joiners that build an emoji or spell a Persian or Hindi word are kept.', ex: ['re⟨SHY⟩sume⟨ZWJ⟩', 'resume'] },
  { k: 'bidi', c: '--bidi', name: 'Direction marks', short: 'All twelve right-to-left controls.', how: 'An override can make text display differently from how it is stored, a trick used to disguise file names and links.', ex: ['invoice⟨RLO⟩fdp.exe', 'invoicefdp.exe'] },
  { k: 'space', c: '--space', name: 'Odd spaces', short: 'Eighteen kinds become a normal space.', how: 'No-break, thin, hair, ideographic and more. Unicode line and paragraph separators become real line breaks.', ex: ['10⟨NNBSP⟩000', '10 000'] },
  { k: 'homoglyph', c: '--homo', name: 'Look-alike letters', short: 'Cyrillic and Greek hiding in English words.', how: 'Caught word by word, so real Russian or Greek is left alone. 𝐒𝐭𝐲𝐥𝐞𝐝 and ｆｕｌｌｗｉｄｔｈ letters are folded back with NFKC.', ex: ['gr⟨е⟩⟨а⟩t', 'great'] },
  { k: 'code', c: '--brand', name: 'Shield code', short: 'Code is set aside, untouched.', how: 'Inline code and fenced blocks are lifted out before any formatting pass, then put back exactly as written.', ex: ['`a — b`', 'a — b'] },
  { k: 'cite', c: '--invisible', name: 'AI citation leftovers', short: 'citeturn, oaicite, 【†source】, utm_source.', how: 'Markers ChatGPT leaves when you copy an answer with sources, and its tracking tag on links. Tracking you added yourself stays.', ex: ['Paris citeturn0search0.', 'Paris.'] },
  { k: 'markdown', c: '--stem', name: 'Markdown to plain text', short: 'Headings, bold, lists, links, tables.', how: 'Also quotes, rules, task lists and phone-app bullets. Links keep their address, tables become tab-separated rows. snake_case and 2 * 3 survive.', ex: ['## **Plan**', 'Plan'] },
  { k: 'dashes', c: '--space', name: 'Dashes, in context', short: 'Each dash is rewritten where it sits.', how: 'Between words it becomes a comma, next to punctuation it goes, and in a range like 2020–2025 it becomes a hyphen.', ex: ['fast—and cheap', 'fast, and cheap'] }
];

const Hidden = ({ s }) => s.split(/(⟨[^⟩]+⟩)/).map((p, i) => p.startsWith('⟨')
  ? <span key={i} className="mx-px rounded bg-bidi-bg px-1 text-[10px] text-bidi">{p.slice(1, -1)}</span> : p);

function Stat({ value, label }) {
  return (
    <div className="grid gap-0.5 rounded-2xl bg-surface px-4 py-3 ring-1 ring-line">
      <span className="text-[26px] font-light leading-none tabular-nums">{value}</span>
      <span className="text-[12px] text-muted">{label}</span>
    </div>
  );
}

export function Engine({ counts, fmt, chars, ms, opts }) {
  const [open, setOpen] = useState(null);
  const hits = { scan: chars, ...counts, ...fmt };
  const caught = PASSES.slice(1).reduce((a, p) => a + (hits[p.k] || 0), 0);
  return (
    <div className="grid gap-6">
      <div className="grid gap-2 text-center">
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-brand">Under the hood</span>
        <h2 className="text-[clamp(26px,5vw,38px)] font-semibold leading-[1.05] tracking-[-0.035em]">A cleaning engine, <em className="font-serif font-normal italic tracking-normal text-brand">not</em> an AI.</h2>
        <p className="mx-auto max-w-[48ch] text-[14.5px] text-muted">Nine passes of plain rules, run on your device. The same text always comes out the same way.</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat value="9" label="passes" />
        <Stat value={chars.toLocaleString()} label="characters checked" />
        <Stat value={ms < 1 ? ms.toFixed(2) : ms.toFixed(1)} label="milliseconds" />
        <Stat value="0" label="bytes sent" />
      </div>

      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {PASSES.map((p, i) => {
          const n = hits[p.k] || 0, off = p.k in opts && !opts[p.k], lit = n > 0 && !off && p.k !== 'scan', isOpen = open === p.k;
          return (
            <motion.li key={p.k} layout initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-30px' }} transition={{ delay: (i % 3) * 0.06, duration: 0.35 }}
              className="rounded-2xl bg-surface ring-1 transition-shadow"
              style={{ '--tw-ring-color': lit ? `color-mix(in oklab, var(${p.c}) 45%, transparent)` : 'var(--line)', boxShadow: lit ? `0 0 0 4px color-mix(in oklab, var(${p.c}) 8%, transparent)` : 'none' }}>
              <button type="button" onClick={() => setOpen(isOpen ? null : p.k)} aria-expanded={isOpen} className="grid h-full w-full gap-3 p-4 text-left">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-muted">{String(i + 1).padStart(2, '0')}</span>
                  <motion.span key={n} initial={{ scale: lit ? 1.25 : 1 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                    className="rounded-full px-2 py-0.5 font-mono text-[11px] tabular-nums"
                    style={lit ? { color: `var(${p.c})`, background: `color-mix(in oklab, var(${p.c}) 14%, transparent)` } : { color: 'var(--muted)', background: 'var(--raised)' }}>
                    {off ? 'off' : p.k === 'scan' ? 'always' : n ? `${n} found` : 'clear'}
                  </motion.span>
                </div>
                <div className="grid gap-1">
                  <h3 className="text-[15px] font-semibold leading-tight">{p.name}</h3>
                  <p className="text-[13px] leading-snug text-muted">{p.short}</p>
                </div>
                <div className="grid gap-1 rounded-xl bg-raised p-2.5 font-mono text-[12px] leading-relaxed">
                  <span className="truncate text-muted"><span className="mr-1.5 opacity-60">{p.lab?.[0] || 'in'}</span><Hidden s={p.ex[0]} /></span>
                  <span className="truncate" style={{ color: `var(${p.c})` }}><span className="mr-1.5 text-muted opacity-60">{p.lab?.[1] || 'out'}</span><Hidden s={p.ex[1]} /></span>
                </div>
                <AnimatePresence initial={false}>
                  {isOpen && <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden text-[12.5px] leading-relaxed text-muted">{p.how}</motion.p>}
                </AnimatePresence>
              </button>
            </motion.li>
          );
        })}
      </ol>

      <p className="text-center text-[13px] text-muted">{caught ? <>This text: <b className="font-medium text-fg">{caught}</b> things caught across the passes. Tap a pass to see how it works.</> : 'Paste some AI text and watch the passes light up. Tap one to see how it works.'}</p>
    </div>
  );
}
