// POST /api/rephrase {wallet, text, goal} -> {text, account}. Paid: each use costs one credit.
import { send, readJson, validWallet, clientIp, charge, refund, getAccount, anthropic, aiErrorMessage, CONFIG, GOALS, KEEP_RULES } from "./_lib.js";

const SYSTEM = [
  "You rewrite the writer's draft in their own voice according to the goal you are given.",
  "Keep the same layout: any \"Subject:\" line, greeting, paragraphs and sign-off.",
  ...KEEP_RULES,
  "Reply with only the rewritten text. No introduction and no notes.",
].join("\n");

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "method" });
  const { wallet, text, goal } = await readJson(req);
  if (!validWallet(wallet)) return send(res, 400, { error: "bad_wallet" });
  if (typeof text !== "string" || !text.trim()) return send(res, 400, { error: "empty", message: "Paste some text first." });
  if (text.length > CONFIG.maxChars) return send(res, 413, { error: "too_long", message: "That text is too long. Paste up to about 1,500 words at a time." });

  let kind;
  try {
    kind = await charge(wallet, clientIp(req), { allowFree: false });
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: "server", message: "Could not check your balance. Try again." });
  }
  if (!kind) return send(res, 402, { error: "payment_required", account: await getAccount(wallet) });

  try {
    // Server-side fallback: if the main model declines, the API retries on a suitable model.
    const response = await anthropic.beta.messages.create({
      model: CONFIG.model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: SYSTEM,
      messages: [{ role: "user", content: `Goal: ${GOALS[goal] || GOALS.natural}\n\n<text>\n${text}\n</text>` }],
    });
    const out = response.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens" || !out) {
      await refund(wallet, kind);
      return send(res, 422, { error: "refused", message: "The AI could not rewrite this text. You were not charged." });
    }
    send(res, 200, { text: out, account: await getAccount(wallet) });
  } catch (err) {
    console.error(err);
    await refund(wallet, kind).catch(() => {});
    send(res, 502, { error: "ai", message: aiErrorMessage(err) + " You were not charged." });
  }
}
