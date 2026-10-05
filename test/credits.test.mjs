// Runs the credit logic and the Paystack webhook against an in-memory fake of the Upstash REST API.
// Usage: node test/credits.test.mjs
import http from "node:http";
import crypto from "node:crypto";
import assert from "node:assert/strict";

const store = new Map();
const fake = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const [cmd, ...a] = JSON.parse(body);
    const num = (k) => Number(store.get(k) || 0);
    let result = null;
    switch (cmd) {
      case "GET": result = store.get(a[0]) ?? null; break;
      case "SET": if (a[2] === "NX" && store.has(a[0])) result = null; else { store.set(a[0], a[1]); result = "OK"; } break;
      case "INCR": store.set(a[0], String(num(a[0]) + 1)); result = num(a[0]); break;
      case "DECR": store.set(a[0], String(num(a[0]) - 1)); result = num(a[0]); break;
      case "INCRBY": store.set(a[0], String(num(a[0]) + Number(a[1]))); result = num(a[0]); break;
      case "EXPIRE": result = 1; break;
      case "EVAL": {
        const [script, , key, ...args] = a;
        if (script.includes("DECR")) { if (num(key) > 0) { store.set(key, String(num(key) - 1)); result = num(key); } else result = -1; }
        else { if (num(key) < Number(args[0])) { store.set(key, String(num(key) + 1)); result = 1; } else result = 0; }
        break;
      }
    }
    res.end(JSON.stringify({ result }));
  });
});
await new Promise((r) => fake.listen(0, r));
process.env.KV_REST_API_URL = `http://127.0.0.1:${fake.address().port}`;
process.env.KV_REST_API_TOKEN = "test";
process.env.PAYSTACK_SECRET_KEY = "sk_test_fake";
process.env.ANTHROPIC_API_KEY = "test";

const lib = await import("../api/_lib.js");
const wallet = crypto.randomUUID();

// Two free suggestions, then payment required
assert.equal(await lib.charge(wallet, "1.1.1.1", { allowFree: true }), "free");
assert.equal(await lib.charge(wallet, "1.1.1.1", { allowFree: true }), "free");
assert.equal(await lib.charge(wallet, "1.1.1.1", { allowFree: true }), null);
// Rephrase is never free
assert.equal(await lib.charge(crypto.randomUUID(), "2.2.2.2", { allowFree: false }), null);

// A payment adds a pack once, however many times it is reported
const first = await lib.creditPayment("REF123456", wallet);
const again = await lib.creditPayment("REF123456", wallet);
assert.equal(first.newlyCredited, true);
assert.equal(again.newlyCredited, false);
assert.equal((await lib.getAccount(wallet)).credits, 10);

// Credits are spent one at a time, and refunds give one back
assert.equal(await lib.charge(wallet, "1.1.1.1", { allowFree: false }), "credit");
await lib.refund(wallet, "credit");
assert.equal((await lib.getAccount(wallet)).credits, 10);

// Per-IP cap: a fresh wallet on the same IP gets no free uses once the daily cap is hit
for (let i = 0; i < 5; i++) {
  const w = crypto.randomUUID();
  await lib.charge(w, "3.3.3.3", { allowFree: true });
  await lib.charge(w, "3.3.3.3", { allowFree: true });
}
assert.equal(await lib.charge(crypto.randomUUID(), "3.3.3.3", { allowFree: true }), null);

// Webhook: rejects a bad signature, credits a valid one exactly once
const { default: webhook } = await import("../api/pay/webhook.js");
async function callWebhook(payload, sign) {
  const raw = JSON.stringify(payload);
  const sig = sign ? crypto.createHmac("sha512", "sk_test_fake").update(raw).digest("hex") : "0".repeat(128);
  const req = Object.assign(require_stream(raw), { method: "POST", headers: { "x-paystack-signature": sig } });
  const res = { statusCode: 0, setHeader() {}, end(b) { this.body = b; } };
  await webhook(req, res);
  return res.statusCode;
}
function require_stream(raw) { return (async function* () { yield Buffer.from(raw); })(); }
const w2 = crypto.randomUUID();
const evt = { event: "charge.success", data: { reference: "REFWEBHOOK1", status: "success", currency: "NGN", amount: 50000, metadata: { wallet: w2, product: "rephrase_pack" } } };
assert.equal(await callWebhook(evt, false), 401);
assert.equal(await callWebhook(evt, true), 200);
assert.equal(await callWebhook(evt, true), 200);
assert.equal((await lib.getAccount(w2)).credits, 10);
// Underpaid charge is ignored
const w3 = crypto.randomUUID();
await callWebhook({ ...evt, data: { ...evt.data, reference: "REFCHEAP01", amount: 100, metadata: { wallet: w3, product: "rephrase_pack" } } }, true);
assert.equal((await lib.getAccount(w3)).credits, 0);

console.log("All credit and webhook checks passed");
fake.close();
