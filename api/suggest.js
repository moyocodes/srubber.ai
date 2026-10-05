// POST /api/suggest {wallet, text, goal} -> {suggestions: [{original, suggestion, why}], account}
// The first FREE_SUGGESTIONS uses per wallet are free; after that each use costs one credit.
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { send, readJson, validWallet, clientIp, charge, refund, getAccount, anthropic, aiErrorMessage, CONFIG, GOALS, KEEP_RULES } from "./_lib.js";

const Suggestions = z.object({
  suggestions: z.array(z.object({
    original: z.string(),
    suggestion: z.string(),
    why: z.string(),
  })),
});

const SYSTEM = [
  "You are an editor. You suggest specific edits to individual sentences or phrases of the writer's draft.",
  "Point out stiff, generic, repetitive, wordy or stock lines and offer a better version of each. Suggest at most 8 edits, most useful first. Skip lines that are already good; an empty list is a fine answer.",
  '"original" must be copied character for character from the draft so it can be found and replaced. "why" is a short reason, under 15 words.',
  ...KEEP_RULES,
].join("\n");

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "method" });
  const { wallet, text, goal } = await readJson(req);
  if (!validWallet(wallet)) return send(res, 400, { error: "bad_wallet" });
  if (typeof text !== "string" || !text.trim()) return send(res, 400, { error: "empty", message: "Paste some text first." });
  if (text.length > CONFIG.maxChars) return send(res, 413, { error: "too_long", message: "That text is too long. Paste up to about 1,500 words at a time." });

  let kind;
  try {
    kind = await charge(wallet, clientIp(req), { allowFree: true });
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: "server", message: "Could not check your balance. Try again." });
  }
  if (!kind) return send(res, 402, { error: "payment_required", account: await getAccount(wallet) });

  try {
    const response = await anthropic.messages.parse({
      model: CONFIG.model,
      max_tokens: 8000,
      output_config: { effort: "low", format: zodOutputFormat(Suggestions) },
      system: SYSTEM,
      messages: [{ role: "user", content: `Goal: ${GOALS[goal] || GOALS.natural}\n\n<text>\n${text}\n</text>` }],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) {
      await refund(wallet, kind);
      return send(res, 422, { error: "refused", message: "The AI could not review this text. Try editing it first." });
    }
    const suggestions = response.parsed_output.suggestions
      .filter((s) => s.original && s.original !== s.suggestion && text.includes(s.original))
      .slice(0, 8);
    send(res, 200, { suggestions, charged: kind, account: await getAccount(wallet) });
  } catch (err) {
    console.error(err);
    await refund(wallet, kind).catch(() => {});
    send(res, 502, { error: "ai", message: aiErrorMessage(err) });
  }
}
