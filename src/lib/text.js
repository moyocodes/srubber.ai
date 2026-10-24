// Detects and removes hidden characters, look-alike letters and optional formatting
const NAMES = {
  0x200B: ['ZWSP', 'ZERO WIDTH SPACE'], 0x200C: ['ZWNJ', 'ZERO WIDTH NON-JOINER'], 0x200D: ['ZWJ', 'ZERO WIDTH JOINER'],
  0x2060: ['WJ', 'WORD JOINER'], 0xFEFF: ['BOM', 'ZERO WIDTH NO-BREAK SPACE (BOM)'], 0x180E: ['MVS', 'MONGOLIAN VOWEL SEPARATOR'],
  0x00AD: ['SHY', 'SOFT HYPHEN'], 0x034F: ['CGJ', 'COMBINING GRAPHEME JOINER'],
  0x2061: ['FA', 'FUNCTION APPLICATION'], 0x2062: ['IT', 'INVISIBLE TIMES'], 0x2063: ['IS', 'INVISIBLE SEPARATOR'], 0x2064: ['IP', 'INVISIBLE PLUS'],
  0x115F: ['HF', 'HANGUL CHOSEONG FILLER'], 0x1160: ['HF', 'HANGUL JUNGSEONG FILLER'], 0x3164: ['HF', 'HANGUL FILLER'], 0xFFA0: ['HF', 'HALFWIDTH HANGUL FILLER'],
  0x17B4: ['KIV', 'KHMER VOWEL INHERENT AQ'], 0x17B5: ['KIV', 'KHMER VOWEL INHERENT AA'], 0x2800: ['BRL', 'BRAILLE PATTERN BLANK'],
  0xFFF9: ['IAA', 'INTERLINEAR ANNOTATION ANCHOR'], 0xFFFA: ['IAS', 'INTERLINEAR ANNOTATION SEPARATOR'], 0xFFFB: ['IAT', 'INTERLINEAR ANNOTATION TERMINATOR'],
  0xFFFC: ['OBJ', 'OBJECT REPLACEMENT CHARACTER'],
  0x200E: ['LRM', 'LEFT-TO-RIGHT MARK'], 0x200F: ['RLM', 'RIGHT-TO-LEFT MARK'], 0x061C: ['ALM', 'ARABIC LETTER MARK'],
  0x202A: ['LRE', 'LEFT-TO-RIGHT EMBEDDING'], 0x202B: ['RLE', 'RIGHT-TO-LEFT EMBEDDING'], 0x202C: ['PDF', 'POP DIRECTIONAL FORMATTING'],
  0x202D: ['LRO', 'LEFT-TO-RIGHT OVERRIDE'], 0x202E: ['RLO', 'RIGHT-TO-LEFT OVERRIDE'],
  0x2066: ['LRI', 'LEFT-TO-RIGHT ISOLATE'], 0x2067: ['RLI', 'RIGHT-TO-LEFT ISOLATE'], 0x2068: ['FSI', 'FIRST STRONG ISOLATE'], 0x2069: ['PDI', 'POP DIRECTIONAL ISOLATE'],
  0x00A0: ['NBSP', 'NO-BREAK SPACE'], 0x202F: ['NNBSP', 'NARROW NO-BREAK SPACE'], 0x205F: ['MMSP', 'MEDIUM MATHEMATICAL SPACE'],
  0x3000: ['IDSP', 'IDEOGRAPHIC SPACE'], 0x1680: ['OGSP', 'OGHAM SPACE MARK'],
  0x2000: ['NQSP', 'EN QUAD'], 0x2001: ['MQSP', 'EM QUAD'], 0x2002: ['ENSP', 'EN SPACE'], 0x2003: ['EMSP', 'EM SPACE'],
  0x2004: ['3/MSP', 'THREE-PER-EM SPACE'], 0x2005: ['4/MSP', 'FOUR-PER-EM SPACE'], 0x2006: ['6/MSP', 'SIX-PER-EM SPACE'],
  0x2007: ['FSP', 'FIGURE SPACE'], 0x2008: ['PSP', 'PUNCTUATION SPACE'], 0x2009: ['THSP', 'THIN SPACE'], 0x200A: ['HSP', 'HAIR SPACE'],
  0x2028: ['LSEP', 'LINE SEPARATOR'], 0x2029: ['PSEP', 'PARAGRAPH SEPARATOR']
};
const BIDI = new Set([0x200E, 0x200F, 0x061C, 0x202A, 0x202B, 0x202C, 0x202D, 0x202E, 0x2066, 0x2067, 0x2068, 0x2069]);
const SPACES = new Set([0x00A0, 0x202F, 0x205F, 0x3000, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200A, 0x2028, 0x2029]);
const NEWLINES = new Set([0x2028, 0x2029]);
// Cyrillic and Greek letters that render identically to Latin ones
const LOOKALIKE = {
  'а':'a','е':'e','о':'o','р':'p','с':'c','х':'x','у':'y','і':'i','ј':'j','ѕ':'s','ԁ':'d','ԛ':'q','ԝ':'w','һ':'h','ӏ':'l',
  'А':'A','В':'B','Е':'E','К':'K','М':'M','Н':'H','О':'O','Р':'P','С':'C','Т':'T','Х':'X','У':'Y','І':'I','Ј':'J','Ѕ':'S',
  'ο':'o','α':'a','ν':'v','ρ':'p','ι':'i','κ':'k','Α':'A','Β':'B','Ε':'E','Ζ':'Z','Η':'H','Ι':'I','Κ':'K','Μ':'M','Ν':'N','Ο':'O','Ρ':'P','Τ':'T','Χ':'X','Υ':'Y'
};
const PICTO = /\p{Extended_Pictographic}/u;
// Letters of scripts (Arabic, Persian, Indic...) whose words need ZWJ/ZWNJ to render correctly
const JOINING = /[\p{L}\p{M}]/u, LATIN = /\p{Script=Latin}/u;
export const hex = cp => 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');

// 𝐛𝐨𝐥𝐝, 𝘪𝘵𝘢𝘭𝘪𝘤 and ｆｕｌｌｗｉｄｔｈ letters used to fake formatting; NFKC turns them into plain ones
const styled = cp => (cp >= 0x1D400 && cp <= 0x1D7FF) || (cp >= 0xFF01 && cp <= 0xFF5E);

function classify(chars, i) {
  const cp = chars[i].codePointAt(0);
  const prev = chars[i - 1] || '', next = chars[i + 1] || '';
  // Keep joiners and VS16 that build emoji sequences
  if (cp === 0x200D && (PICTO.test(prev) || prev === '️') && PICTO.test(next)) return null;
  if (cp === 0xFE0F && /[\p{Extended_Pictographic}0-9#*]/u.test(prev)) return null;
  // Keep joiners inside non-Latin words, where they change how the word is spelled
  if ((cp === 0x200C || cp === 0x200D) && JOINING.test(prev) && JOINING.test(next) && !LATIN.test(prev) && !LATIN.test(next)) return null;
  if (BIDI.has(cp)) return { cat: 'bidi', label: NAMES[cp][0], name: NAMES[cp][1] };
  if (SPACES.has(cp)) return { cat: 'space', label: NAMES[cp][0], name: NAMES[cp][1], to: NEWLINES.has(cp) ? '\n' : ' ' };
  if (NAMES[cp]) return { cat: 'invisible', label: NAMES[cp][0], name: NAMES[cp][1] };
  if (cp >= 0xFE00 && cp <= 0xFE0F) return { cat: 'invisible', label: 'VS' + (cp - 0xFDFF), name: 'VARIATION SELECTOR-' + (cp - 0xFDFF) };
  if (cp >= 0xE0100 && cp <= 0xE01EF) return { cat: 'invisible', label: 'VS' + (cp - 0xE00EF), name: 'VARIATION SELECTOR-' + (cp - 0xE00EF) };
  if (cp >= 0xE0000 && cp <= 0xE007F) return { cat: 'invisible', label: 'TAG', name: 'TAG CHARACTER (invisible)' };
  if (cp >= 0x1D173 && cp <= 0x1D17A) return { cat: 'invisible', label: 'MFC', name: 'MUSICAL FORMATTING CHARACTER (invisible)' };
  if ((cp < 0x20 && cp !== 0x09 && cp !== 0x0A && cp !== 0x0D) || (cp >= 0x7F && cp <= 0x9F)) return { cat: 'invisible', label: 'CTRL', name: 'CONTROL CHARACTER ' + hex(cp) };
  if (cp >= 0xE000 && cp <= 0xF8FF) return { cat: 'invisible', label: 'PUA', name: 'PRIVATE USE CHARACTER (shows as a box or nothing)' };
  if (styled(cp)) {
    const to = chars[i].normalize('NFKC');
    if (to !== chars[i]) return { cat: 'homoglyph', name: `Styled letter ${chars[i]} (${hex(cp)}), shown as "${to}"`, to };
  }
  return null;
}

function lookalikeIndexes(chars) {
  const hits = new Set();
  let start = -1;
  const flush = end => {
    if (start < 0) return;
    const word = chars.slice(start, end);
    if (word.some(c => LATIN.test(c))) word.forEach((c, k) => { if (LOOKALIKE[c]) hits.add(start + k); });
    start = -1;
  };
  chars.forEach((c, i) => {
    if (/[\p{L}\p{M}]/u.test(c)) { if (start < 0) start = i; }
    else if (!classify(chars, i) || classify(chars, i).cat === 'space') flush(i);
  });
  flush(chars.length);
  return hits;
}

export function analyze(text) {
  const chars = Array.from(text);
  const homo = lookalikeIndexes(chars);
  return chars.map((c, i) => homo.has(i)
    ? { c, info: { cat: 'homoglyph', name: `Look-alike ${c} (${hex(c.codePointAt(0))}), shown as Latin "${LOOKALIKE[c]}"`, to: LOOKALIKE[c] } }
    : { c, info: classify(chars, i) });
}

// ---------- optional formatting ----------

// Leftovers from copying out of ChatGPT and other assistants: citation markers and tracking tags on links
const CITE = /[-]?\bcite(?:[-]?turn\d+[a-z]+\d+)+[-]?|:?contentReference\[oaicite:\d+\](?:\{index=\d+\})?|\[oaicite:\d+\]|【[^】\n]*†[^】\n]*】/g;
const TRACKER = '(?:chatgpt\\.com|openai|perplexity(?:\\.ai)?|copilot\\.com|claude\\.ai|gemini\\.google\\.com)';
const UTM_FIRST = new RegExp(`\\?utm_source=${TRACKER}&`, 'gi');
const UTM = new RegExp(`[?&]utm_source=${TRACKER}(?![\\w.%-])`, 'gi');
const MD = /\*\*[^*\n]+\*\*|(?<!\w)__[^_\n]+__(?!\w)|~~[^~\n]+~~|^#{1,6}[ \t]|^[ \t]*>[ \t]|^[ \t]*[*+•◦▪▫‣●○■□⁃∙][ \t]|^[ \t]*(?:[-*_][ \t]*){3,}$|!?\[[^\]\n]+\]\([^)\s]+\)|^[ \t]*\|.*\|[ \t]*$|```|\\[*_#`]/gm;
const EMOJI = /(?:(?![©®™])\p{Extended_Pictographic}[️‍\p{Emoji_Modifier}]*)+[ \t]?/gu;
// Code is kept exactly as written: no quote, dash or Markdown changes inside it
const CODE = /```[^\n]*\n([\s\S]*?)\n?```|`([^`\n]+)`/g;

// Counts of formatting the optional settings act on, for the chips above the editor
export function formatting(text) {
  const n = re => (text.match(re) || []).length;
  return {
    dashes: n(/[–—―]/g),
    markdown: n(MD),
    cite: n(CITE) + n(UTM),
    quotes: n(/[‘’‚‛“”„‟…]/g),
    emoji: n(/(?![©®™])\p{Extended_Pictographic}/gu),
    code: n(CODE)
  };
}

function stripMarkdown(s) {
  const esc = [];
  return s
    .replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, (m, c) => `﷒${esc.push(c) - 1}﷓`) // escaped characters are literal
    .replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm, '')                         // horizontal rules
    .replace(/^[ \t]*={3,}[ \t]*$/gm, '')                                 // setext heading underline
    .replace(/^([ \t]*)>[ \t>]*/gm, '$1')                                 // blockquotes
    .replace(/^#{1,6}[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/gm, '$1')             // headings
    .replace(/^(?=[^\n]*\|)(?=[^\n]*-)[ \t|:-]+(?:\n|$)/gm, '')            // table divider rows
    .replace(/^[ \t]*\|(.*)\|[ \t]*$/gm, (m, row) => row.split('|').map(c => c.trim()).join('\t')) // table rows become tab-separated
    .replace(/^([ \t]*)[-*+][ \t]+\[[ xX]\][ \t]+/gm, '$1- ')             // task lists
    .replace(/^([ \t]*)[*+•◦▪▫‣●○■□⁃∙][ \t]+/gm, '$1- ')                    // bullets, including ones copied from phone apps
    .replace(/^\[\^([^\]]+)\]:[ \t]*/gm, '$1. ')                          // footnote definitions
    .replace(/\[\^[^\]\n]+\]/g, '')                                       // footnote references
    .replace(/!\[([^\]\n]*)\]\([^)\s]+(?:[ \t]+"[^"\n]*")?\)/g, '$1')       // images keep their alt text
    .replace(/\[([^\]\n]+)\]\((\S+?)(?:[ \t]+"[^"\n]*")?\)/g, (m, t, u) => t === u || u.startsWith('#') ? t : `${t} (${u})`) // links
    .replace(/<((?:https?|mailto):[^>\s]+)>/g, '$1')                      // autolinks
    .replace(/(\*\*\*|(?<!\w)___)(?=\S)([^\n]*?\S)\1/g, '$2')              // bold italic
    .replace(/\*\*(?=\S)([^\n]*?\S)\*\*/g, '$1')                           // bold
    .replace(/(?<!\w)__(?=\S)([^\n]*?\S)__(?!\w)/g, '$1')
    .replace(/~~(?=\S)([^\n]*?\S)~~/g, '$1')                               // strikethrough
    .replace(/(^|[^*\w])\*(?=\S)([^*\n]*?\S)\*(?![*\w])/gm, '$1$2')        // italic
    .replace(/(^|[^_\w])_(?=\S)([^_\n]*?\S)_(?![_\w])/gm, '$1$2')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(?:b|i|u|s|em|strong|del|ins|sup|sub|span|mark|small)\b[^>]*>/gi, '')
    .replace(/﷒(\d+)﷓/g, (m, i) => esc[i]);
}

// "smart" reads each dash in context, the way a person would rewrite it; "hyphen" swaps in a spaced hyphen
function plainDashes(s, style) {
  s = s.replace(/[‐‑]/g, '-')
    .replace(/(\d)[ \t]?[–—][ \t]?(?=\d)/g, '$1-')                         // ranges: 2020–2025
    .replace(/(\p{L})–(?=\p{L})/gu, '$1-')                                 // unspaced en dash: Mon–Fri, London–Paris
    .replace(/^([ \t]*)[—―–][ \t]*/gm, '$1- ');                            // dash at the start of a line
  if (style === 'hyphen') return s.replace(/[ \t]*[—―–][ \t]*/g, ' - ');
  return s
    .replace(/[ \t]*[—―–]+[ \t]*(?=[.,;:!?)\]"'”’]|$)/gm, '')               // before punctuation or the line end: drop it
    .replace(/([,;:.!?])[ \t]*[—―–]+[ \t]*/g, '$1 ')                        // after punctuation: drop it
    .replace(/[ \t]*[—―–]+[ \t]*/g, ', ')                                   // between words: a comma
    .replace(/,[ \t]*,/g, ',');
}

export function clean(items, o) {
  let s = items.map(({ c, info }) => {
    if (!info) return c;
    if (info.cat === 'invisible') return o.invisible ? '' : c;
    if (info.cat === 'bidi') return o.bidi ? '' : c;
    if (info.cat === 'space') return o.space ? info.to : c;
    if (info.cat === 'homoglyph') return o.homoglyph ? info.to : c;
    return c;
  }).join('');
  const code = [];
  s = s.replace(CODE, (m, block, inline) => { code.push(o.markdown ? block ?? inline : m); return `﷐${code.length - 1}﷑`; });
  if (o.cite) s = s.replace(CITE, '').replace(UTM_FIRST, '?').replace(UTM, '').replace(/(\w)[ \t]+(?=[.,;:!?](?:\s|$))/g, '$1');
  if (o.markdown) s = stripMarkdown(s);
  if (o.quotes) s = s.replace(/[‘’‚‛′]/g, "'").replace(/[“”„‟″]/g, '"').replace(/…/g, '...');
  if (o.dashes) s = plainDashes(s, o.dashStyle);
  if (o.emoji) s = s.replace(EMOJI, '');
  if (o.tidy) s = s.replace(/[ \t]+$/gm, '').replace(/(\S)[ \t]{2,}/g, '$1 ').replace(/(\w)[ \t]+([,.;:!?])(?=\s|$)/g, '$1$2').replace(/\n{3,}/g, '\n\n').trim();
  return s.replace(/﷐(\d+)﷑/g, (m, i) => code[i]);
}
