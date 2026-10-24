// GET /api/account?wallet=<id> -> free uses left, paid credits, price
import { send, validWallet, getAccount } from "./_lib.js";

export default async function handler(req, res) {
  const wallet = new URL(req.url, "http://x").searchParams.get("wallet");
  if (!validWallet(wallet)) return send(res, 400, { error: "bad_wallet" });
  try {
    send(res, 200, await getAccount(wallet));
  } catch (err) {
    console.error(err);
    send(res, 500, { error: "server", message: "Could not load your balance. Try again." });
  }
}
