// Checks the local cleaner: hidden characters, look-alikes and the optional formatting rules.
// Usage: node test/text.test.mjs
import assert from "node:assert/strict";
import { analyze, clean, formatting } from "../src/lib/text.js";

const ALL = { invisible: true, bidi: true, space: true, homoglyph: true, quotes: true, dashes: true, dashStyle: "smart", markdown: true, cite: true, emoji: false, tidy: true };
const run = (text, o = {}) => clean(analyze(text), { ...ALL, ...o });
let n = 0;
const eq = (text, want, o) => { assert.equal(run(text, o), want, JSON.stringify(text)); n++; };

// Hidden characters
eq("Hel​lo‎ wor ld﻿", "Hello wor ld");
eq("a b", "a\nb");
eq("x\u0007yz", "xyz");
eq("greаt", "great");
eq("\u{1D41B}\u{1D428}\u{1D425}\u{1D41D} ｆｕｌｌ", "bold full");
// Joiners that build emoji or non-Latin words stay
eq("👨‍👩‍👧", "👨‍👩‍👧");
eq("می‌خواهم", "می‌خواهم");
eq("in‌visible", "invisible");

// Dashes
eq("clear—the model", "clear, the model");
eq("clear — the model", "clear, the model");
eq("It worked—mostly—in the end.", "It worked, mostly, in the end.");
eq("I waited—.", "I waited.");
eq("Wait,— no.", "Wait, no.");
eq("2020–2025 and pages 4 – 9", "2020-2025 and pages 4-9");
eq("Mon–Fri", "Mon-Fri");
eq("— a line", "- a line");
eq("data‑driven", "data-driven");
eq("clear—the model", "clear - the model", { dashStyle: "hyphen" });
eq("clear—the model", "clear—the model", { dashes: false });

// Markdown
eq("# Title\n\nSome **bold**, *italic*, _also_, ***both*** and ~~gone~~.", "Title\n\nSome bold, italic, also, both and gone.");
eq("## Learn C#", "Learn C#");
eq("* one\n+ two\n  * nested\n- [x] done", "- one\n- two\n  - nested\n- done");
eq("• one\n  ◦ two\n▪ three", "- one\n  - two\n- three");
eq("> quoted\n>> deeper", "quoted\ndeeper");
eq("Above\n\n---\n\nBelow", "Above\n\nBelow");
eq("See [the docs](https://x.io/a) and ![logo](a.png) and <https://y.io>.", "See the docs (https://x.io/a) and logo and https://y.io.");
eq("| Name | Age |\n|---|:--:|\n| Ann | 30 |", "Name\tAge\nAnn\t30");
eq("snake_case_name and 2 * 3 * 4", "snake_case_name and 2 * 3 * 4");
eq("Price \\*not\\* bold", "Price *not* bold");
eq("Run `npm “test” — now` please", "Run npm “test” — now please");
eq("```js\nconst a = \"x\" — 1;\n```", "const a = \"x\" — 1;");
eq("Run `x`", "Run `x`", { markdown: false });
eq("A fact.[^1]\n\n[^1]: Source", "A fact.\n\n1. Source");

// AI leftovers
eq("Paris is the capital citeturn0search0turn0news2.", "Paris is the capital.");
eq("Paris citeturn0search0 is big.", "Paris is big.");
eq("Big city :contentReference[oaicite:0]{index=0}.", "Big city.");
eq("Big city【4:0†source】.", "Big city.");
eq("https://a.com/p?utm_source=chatgpt.com", "https://a.com/p");
eq("https://a.com/p?utm_source=chatgpt.com&id=2", "https://a.com/p?id=2");
eq("https://a.com/p?id=2&utm_source=openai", "https://a.com/p?id=2");
eq("https://a.com/p?utm_source=newsletter", "https://a.com/p?utm_source=newsletter");

// Quotes, emoji, tidy
eq("“Hi” it’s… fine", "\"Hi\" it's... fine");
eq("🚀 Launch plan ✅ done ©", "Launch plan done ©", { emoji: true });
eq("a   b  \n\n\n\nc ,", "a b\n\nc,");

// Counts for the chips
const f = formatting("**Hi** — “x” citeturn0search0 🚀");
assert.deepEqual([f.markdown, f.dashes, f.quotes, f.cite, f.emoji], [1, 1, 2, 1, 1]);

console.log(`text: ${n + 1} checks passed`);
