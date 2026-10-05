// POST /api/pay/start {wallet, email} -> {url} to Paystack checkout for one credit pack
import { send, readJson, validWallet, CONFIG } from "../_lib.js";
import { paystack } from "./_paystack.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "method" });
  const { wallet, email } = await readJson(req);
  if (!validWallet(wallet)) return send(res, 400, { error: "bad_wallet" });
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return send(res, 400, { error: "bad_email", message: "Enter a valid email address for your receipt." });
  }
  const origin = process.env.SITE_URL || `https://${req.headers.host}`;
  try {
    const tx = await paystack("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email,
        amount: CONFIG.priceNgn * 100, // kobo
        currency: "NGN",
        callback_url: `${origin}/`,
        metadata: { wallet, product: "rephrase_pack", uses: CONFIG.packUses },
      }),
    });
    send(res, 200, { url: tx.authorization_url, reference: tx.reference });
  } catch (err) {
    console.error(err);
    send(res, 502, { error: "paystack", message: "Could not start the payment. Try again." });
  }
}
