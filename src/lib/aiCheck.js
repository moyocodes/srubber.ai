// AI-style check: local heuristics for phrases and patterns AI writing overuses
const AI_PHRASES = [
  [8, 'hope this (?:email|message) finds you well', 'stock email opener'],
  [6, 'hope you(?: are|\'re) having an? (?:lovely|great|wonderful|good) (?:week|day)', 'stock email opener'],
  [6, '(?:please )?(?:do not|don\'t) hesitate to', 'stock closing line'],
  [4, 'feel free to reach out', 'stock closing line'],
  [3, 'thank you (?:so much )?for your time and consideration', 'stock closing line'],
  [8, 'delve(?:s|d)? into', 'classic AI word'],
  [8, '(?:rich )?tapestry', 'classic AI word'],
  [6, '(?:is|stands as) a testament to', 'classic AI phrase'],
  [6, 'in today\'s (?:fast-paced|digital|ever-changing)', 'classic AI opener'],
  [5, 'ever-(?:evolving|changing)', 'classic AI phrase'],
  [5, 'navigat(?:e|ing) the complexities', 'classic AI phrase'],
  [5, 'plays? a (?:crucial|pivotal|vital) role', 'classic AI phrase'],
  [5, 'it is (?:important|worth) (?:to note|noting)|it\'s worth noting', 'filler phrase'],
  [4, 'pivotal|paramount|multifaceted|meticulous(?:ly)?|commendable|invaluable', 'overused AI word'],
  [3, 'seamless(?:ly)?|robust|holistic|cutting-edge|game-changer', 'overused AI word'],
  [3, 'leverag(?:e|ing)|foster(?:ing)?|harness(?:ing)?|underscore(?:s|d)?|showcas(?:e|es|ing)|elevat(?:e|ing)|unlock(?:ing)?|embark(?:ing)? on', 'overused AI verb'],
  [4, 'unique blend|deeply passionate|eager to contribute|thrilled (?:to|by|at)', 'common in AI-written applications'],
  [4, 'very excited about the opportunity|excited about the opportunity', 'common in AI-written applications'],
  [3, 'i completely understand|for all the work you do|i truly appreciate', 'polite filler AI tools add'],
  [3, 'not only .{1,60}? but also', '"not only ... but also" pattern'],
  [3, 'in conclusion|to sum up|overall,', 'essay-style wrap-up'],
  [2, 'furthermore|moreover|additionally', 'formal linking word']
].map(([w, src, why]) => ({ w, re: new RegExp('\\b(?:' + src + ')\\b', 'gi'), why }));

export function aiCheck(text) {
  const t = text.replace(/[‘’]/g, "'");
  const found = [];
  AI_PHRASES.forEach(({ w, re, why }) => {
    const hits = t.match(re);
    if (!hits) return;
    const uniq = [...new Set(hits.map(h => h.toLowerCase()))];
    found.push({ pts: w * Math.min(hits.length, 3), quotes: uniq, repeat: hits.length > uniq.length ? hits.length : 0, text: why });
  });
  const words = (t.match(/[A-Za-z']+/g) || []).length;
  const dashes = (t.match(/—/g) || []).length;
  if (dashes && dashes / Math.max(words, 1) * 100 > 0.4) found.push({ pts: Math.min(dashes * 4, 12), text: `${dashes} em dash${dashes === 1 ? '' : 'es'} (—): AI tools use far more than most people` });
  const sentences = t.split(/(?<=[.!?])\s+/).map(x => (x.match(/[A-Za-z']+/g) || []).length).filter(n => n >= 3);
  if (sentences.length >= 5) {
    const mean = sentences.reduce((a, b) => a + b, 0) / sentences.length;
    const cv = Math.sqrt(sentences.reduce((a, n) => a + (n - mean) ** 2, 0) / sentences.length) / mean;
    if (cv < 0.3) found.push({ pts: 12, text: 'Sentences are all a similar length. Mix in some short ones.' });
  }
  const contractions = (t.match(/\b\w+'(?:m|re|s|ve|ll|d|t)\b/gi) || []).length;
  if (words > 150 && contractions === 0) found.push({ pts: 5, text: 'No contractions (I\'m, don\'t) in a long text. That can read stiff.' });
  found.sort((a, b) => b.pts - a.pts);
  const score = Math.min(100, Math.round(found.reduce((a, f) => a + f.pts, 0) * Math.min(1, 120 / Math.max(words, 60)) * 1.4));
  return { score, found, words };
}

