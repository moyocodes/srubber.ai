// Word-level diff (longest common subsequence) between the original and the final text
export function diffWords(a, b) {
  const A = a.split(/(\s+)/).filter(Boolean), B = b.split(/(\s+)/).filter(Boolean);
  const n = A.length, m = B.length;
  if (n * m > 4e6) return null;
  const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const ops = [];
  const push = (t, x) => { const last = ops[ops.length - 1]; if (last && last.t === t) last.x += x; else ops.push({ t, x }); };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { push('=', A[i]); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) push('-', A[i++]);
    else push('+', B[j++]);
  }
  while (i < n) push('-', A[i++]);
  while (j < m) push('+', B[j++]);
  // Merge changes separated only by a single space, so a rewritten phrase reads as one change
  const out = [];
  for (let k = 0; k < ops.length; k++) {
    const o = ops[k];
    if (o.t === '=' && o.x === ' ' && out.length && out[out.length - 1].t !== '=' && ops[k + 1] && ops[k + 1].t !== '=') {
      const g = out[out.length - 1];
      g.del += ' '; g.ins += ' ';
      continue;
    }
    if (o.t === '=') { out.push(o); continue; }
    let g = out[out.length - 1];
    if (!g || g.t === '=') { g = { t: 'chg', del: '', ins: '' }; out.push(g); }
    if (o.t === '-') g.del += o.x; else g.ins += o.x;
  }
  out.forEach(g => { if (g.t === 'chg') { g.del = g.del.trim() ? g.del.replace(/ +$/, '') : g.del; g.ins = g.ins.trim() ? g.ins.replace(/ +$/, '') : g.ins; } });
  return out;
}

