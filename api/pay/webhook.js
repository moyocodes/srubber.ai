// POST /api/pay/webhook — Paystack calls this on every successful charge, so credits arrive
// even if the buyer closes the page before being sent back. Set this URL in the Paystack dashboard.
import crypto from "node:crypto";
import { send, readRaw, creditPayment } from "../_lib.js";
import { isValidPack } from "./_paystack.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "method" });
  const raw = await readRaw(req);
  const expected = crypto.createHmac("sha512", process.env.PAYSTACK_SECRET_KEY || "").update(raw).digest("hex");
  const given = String(req.headers["x-paystack-signature"] || "");
  if (given.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return send(res, 401, { error: "bad_signature" });
  }
  let event;
  try { event = JSON.parse(raw); } catch { return send(res, 400, { error: "bad_json" }); }
  if (event.event === "charge.success" && isValidPack(event.data)) {
    try {
      await creditPayment(event.data.reference, event.data.metadata.wallet);
    } catch (err) {
      console.error(err);
      return send(res, 500, { error: "server" }); // Paystack retries on non-200
    }
  }
  send(res, 200, { ok: true });
}
