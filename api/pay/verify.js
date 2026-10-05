// GET /api/pay/verify?reference=<ref>
// Called when Paystack sends the buyer back, or when someone restores a purchase from their receipt.
// Returns the wallet the payment belongs to, so a buyer on a new phone gets their credits back.
import { send, creditPayment, getAccount } from "../_lib.js";
import { paystack, isValidPack } from "./_paystack.js";

export default async function handler(req, res) {
  const reference = new URL(req.url, "http://x").searchParams.get("reference") || "";
  if (!/^[A-Za-z0-9._=-]{6,100}$/.test(reference)) {
    return send(res, 400, { error: "bad_reference", message: "That doesn't look like a Paystack reference." });
  }
  try {
    const tx = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`);
    if (!isValidPack(tx)) {
      return send(res, 402, { error: "not_paid", message: "This payment hasn't gone through. If you were charged, try again in a minute." });
    }
    const { wallet, newlyCredited } = await creditPayment(reference, tx.metadata.wallet);
    send(res, 200, { wallet, newlyCredited, account: await getAccount(wallet) });
  } catch (err) {
    console.error(err);
    send(res, 502, { error: "paystack", message: "Could not confirm the payment. Try again in a minute." });
  }
}
