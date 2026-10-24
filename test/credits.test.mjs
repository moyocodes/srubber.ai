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
      case "DECRBY": store.set(a[0], String(num(a[0]) - Number(a[1]))); result = num(a[0]); break;
      case "EXPIRE": result = 1; break;
      case "EVAL": {
        // The one script in _lib.js: spend free credits first, then paid ones, all or nothing
        const [, , usedKey, paidKey, ipKey, cost, cap, ipCap] = a;
        const free = Math.min(Number(cost), Math.max(0, Math.min(Number(cap) - num(usedKey), Number(ipCap) - num(ipKey))));
        const rest = Number(cost) - free;
        if (rest > num(paidKey)) { result = [-1, -1]; break; }
        store.set(usedKey, String(num(usedKey) + free)); store.set(ipKey, String(num(ipKey) + free)); store.set(paidKey, String(num(paidKey) - rest));
        result = [free, rest];
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
// Small limits so running out is quick to test; production defaults are 20 per wallet and 40 per IP a day
process.env.FREE_USES = "2";
process.env.FREE_PER_IP_PER_DAY = "10";

const lib = await import("../api/_lib.js");
const wallet = crypto.randomUUID();

const PACK = lib.CONFIG.packUses;

// Two free credits, spent by any AI action, then payment required
assert.deepEqual(await lib.charge(wallet, "1.1.1.1", 1), { free: 1, paid: 0 });
assert.deepEqual(await lib.charge(wallet, "1.1.1.1", 1), { free: 1, paid: 0 });
assert.equal(await lib.charge(wallet, "1.1.1.1", 1), null);
assert.equal((await lib.getAccount(wallet)).freeLeft, 0);
// An action costing more than the free credits left is refused whole, and spends nothing
const thin = crypto.randomUUID();
assert.equal(await lib.charge(thin, "4.4.4.4", 3), null);
assert.equal((await lib.getAccount(thin)).freeLeft, 2);

// A payment adds a pack once, however many times it is reported
const first = await lib.creditPayment("REF123456", wallet);
const again = await lib.creditPayment("REF123456", wallet);
assert.equal(first.newlyCredited, true);
assert.equal(again.newlyCredited, false);
assert.equal((await lib.getAccount(wallet)).credits, PACK);

// Multi-credit actions spend free credits first, then paid; refunds give back exactly what was taken
await lib.creditPayment("REFMIX0001", thin);
assert.deepEqual(await lib.charge(thin, "4.4.4.4", 3), { free: 2, paid: 1 });
assert.equal((await lib.getAccount(thin)).credits, PACK - 1);
await lib.refund(thin, { free: 2, paid: 1 });
assert.deepEqual([(await lib.getAccount(thin)).freeLeft, (await lib.getAccount(thin)).credits], [2, PACK]);

// Cost per action follows the text length for rephrase
assert.equal(lib.creditCost("suggest", "short text"), lib.CONFIG.costs.suggest);
assert.equal(lib.creditCost("rephrase", "short text"), lib.CONFIG.costs.rephrase);
assert.equal(lib.creditCost("rephrase", "word ".repeat(lib.CONFIG.costs.longWords + 1)), lib.CONFIG.costs.rephraseLong);

// Per-IP cap: a fresh wallet on the same IP gets no free credits once the daily cap is hit
for (let i = 0; i < 5; i++) await lib.charge(crypto.randomUUID(), "3.3.3.3", 2);
assert.equal(await lib.charge(crypto.randomUUID(), "3.3.3.3", 1), null);

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
const evt = { event: "charge.success", data: { reference: "REFWEBHOOK1", status: "success", currency: "NGN", amount: lib.CONFIG.priceNgn * 100, metadata: { wallet: w2, product: "rephrase_pack" } } };
assert.equal(await callWebhook(evt, false), 401);
assert.equal(await callWebhook(evt, true), 200);
assert.equal(await callWebhook(evt, true), 200);
assert.equal((await lib.getAccount(w2)).credits, PACK);
// Underpaid charge is ignored
const w3 = crypto.randomUUID();
await callWebhook({ ...evt, data: { ...evt.data, reference: "REFCHEAP01", amount: 100, metadata: { wallet: w3, product: "rephrase_pack" } } }, true);
assert.equal((await lib.getAccount(w3)).credits, 0);

console.log("All credit and webhook checks passed");
fake.close();
