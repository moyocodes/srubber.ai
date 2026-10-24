// Each browser gets an anonymous wallet id that holds its free uses and paid credits.
const KEY = 'scrubber-wallet';

export function walletId() {
  let id = null;
  try { id = localStorage.getItem(KEY); } catch (e) {}
  if (!/^[0-9a-f-]{36}$/.test(id || '')) {
    id = crypto.randomUUID();
    try { localStorage.setItem(KEY, id); } catch (e) {}
  }
  return id;
}
export function setWallet(id) { try { localStorage.setItem(KEY, id); } catch (e) {} }

// GET when there is no body, JSON POST otherwise. Errors carry status, code and the parsed body (it may hold an account).
export async function request(path, body, signal) {
  const r = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal } : { signal });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.message || 'Something went wrong. Try again.'), { status: r.status, code: data.error, data });
  return data;
}

export const naira = n => '₦' + Number(n).toLocaleString('en-NG');
