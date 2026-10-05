// Paystack REST helpers. Docs: https://paystack.com/docs/api/transaction/
import { CONFIG } from "../_lib.js";

const SECRET = process.env.PAYSTACK_SECRET_KEY;

export async function paystack(path, init = {}) {
  if (!SECRET) throw new Error("PAYSTACK_SECRET_KEY is not set");
  const r = await fetch("https://api.paystack.co" + path, {
    ...init,
    headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.status) throw new Error("Paystack: " + (data.message || r.status));
  return data.data;
}

// A transaction counts only if it succeeded, in naira, for at least the pack price, for our product.
export function isValidPack(tx) {
  return tx && tx.status === "success" && tx.currency === "NGN"
    && Number(tx.amount) >= CONFIG.priceNgn * 100
    && tx.metadata && tx.metadata.product === "rephrase_pack";
}
