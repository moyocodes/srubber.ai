# Scrubber.ai

Paste text from ChatGPT, Claude, a PDF or a website and get back clean plain text: no zero-width characters, direction marks, odd spaces, look-alike letters or dark-mode formatting. Then check it for AI-style phrasing, get suggested edits, or pay for a full rephrase.

| Feature | Price | Where it runs |
|---|---|---|
| Hidden-character cleaning, inspector, plain-text copy | Free | In the browser |
| AI-style check | Free | In the browser |
| Compare with original, undo | Free | In the browser |
| Suggested edits | 2 free per person, then 1 paid use each | Server → Claude |
| Rephrase | 1 paid use each | Server → Claude |
| Paid uses | ₦500 for 10 (Paystack) | Server |

## How it compares with other AI text cleaners and humanizers

| Common limitation | What Scrubber.ai does instead |
|---|---|
| Strips every zero-width joiner, breaking emoji like 👨‍👩‍👧 | Keeps the joiners that build emoji, removes the rest |
| Removes characters without showing what changed | Inspector shows every hidden character; Compare shows every word changed |
| Changes typography by default (em dashes, curly quotes) | Those are optional switches, off by default |
| Copying still carries dark-mode background and fonts | Copy button copies plain text only |
| Sends your text to a server even for basic cleaning | Cleaning and the AI-style check never leave the browser |
| Humanizers cap free use at around 125 words and need an account | Cleaning is unlimited with no account; paid uses take up to about 1,500 words |
| Humanizers change names, dates and numbers, or add errors on purpose | Prompts forbid changing names, dates, numbers, reference codes and contact details; every change is shown and can be undone |
| Claim to make text "undetectable" or remove watermarks | States plainly what no tool can promise |

## Project layout

```
index.html            the whole front end (no build step)
api/_lib.js           config, Redis credits, Claude client, shared prompt rules
api/account.js        GET  balance for a wallet
api/suggest.js        POST suggested edits (free twice, then paid)
api/rephrase.js       POST full rephrase (paid)
api/pay/start.js      POST start a Paystack checkout
api/pay/verify.js     GET  confirm a payment / restore a purchase by reference
api/pay/webhook.js    POST Paystack webhook (credits even if the buyer closes the tab)
test/credits.test.mjs credit and webhook checks against a fake Redis
```

Each browser gets an anonymous wallet id (stored in `localStorage`). Free uses and paid credits belong to that id. A buyer who changes phone can restore credits with the Paystack reference from their receipt email. Free uses are also capped per IP address per day, so clearing the browser does not give unlimited free suggestions. Failed AI calls refund the use.

## Deploy on Vercel

1. Import this repo in Vercel (Framework preset: **Other**, no build command).
2. **Storage → Create → Upstash Redis**, connect it to the project. This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
3. **Settings → Environment Variables**: add `ANTHROPIC_API_KEY` and `PAYSTACK_SECRET_KEY` (use the `sk_test_` key first). See `.env.example` for optional settings.
4. Deploy.
5. In the Paystack dashboard, **Settings → API Keys & Webhooks**, set the webhook URL to `https://<your-domain>/api/pay/webhook`.
6. Test a purchase with a Paystack test card, then switch to the `sk_live_` key.

## Checks

```
npm install
npm run check                 # syntax-check every API file
node test/credits.test.mjs    # credits, refunds, IP cap, webhook signature and idempotency
```
