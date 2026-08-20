// DeepL plumbing, shared by everything that translates anything here:
//   scripts/translate.mjs          — the UI dictionaries in src/i18n/
//   scripts/translate-content.mjs  — the board's content in content/
//   worker/translate.js            — the same, when the board presses Save
//
// IT RUNS IN TWO RUNTIMES, so it must stay free of Node built-ins: no fs, no
// process, no node: imports, in this file or in the three beside it. `fetch`,
// `crypto.subtle` and the standard library are the whole budget. The key comes
// in as an argument (scripts/lib/require-api-key.mjs reads it from the
// environment; the Worker resolves it from KV or a secret), and `fetchImpl` is
// injectable so a test never touches the network.
//
// This replaces claude.mjs. The reason for the swap is succession, not quality:
// the Claude pipeline depends on ANTHROPIC_API_KEY, a metered key billed to
// whoever is currently president, and the board decided (2026-08-06, see
// PLAN.md §4) that the site must not depend on a personal card. DeepL's free
// tier covers this club's volume — see PLAN.md's table — at no cost to anyone.
//
// WHAT THIS GIVES UP, AND WHAT REPLACES IT
//
// Claude took the whole dictionary in one request, so it could see a button's
// label next to its in-flight state and decide terminology once across all 178
// keys. DeepL takes one string per request and cannot be handed a system prompt
// of pinned terms and style rules — so that context has to travel a different
// way. Two mitigations, per PLAN.md:
//
//   * the `context` parameter — one string of surrounding text per request,
//     not translated and not billed. `translateSet` below builds it per item:
//     the joined sentence for a split Pre/Link/Post group, or a hand-written
//     note (see NOTES in translate.mjs / the sibling field in
//     translate-content.mjs).
//   * src/lib/translate/validate.js, unchanged by this swap — it checks the output,
//     not the process, so it is the real net regardless of which engine wrote
//     the text. NOTHING IS WRITTEN until it passes.
//
// Terminology pinning has no live enforcement here: DeepL glossaries do not
// exist for en->hr/bs/sr (checked against the live API, PLAN.md §4). validate.js
// asserts the canonical term as a warning, not silently.
//
// NOT PART OF THE BUILD. `npm run build` never calls this — the build stays
// hermetic, which is load-bearing in CLAUDE.md.

import { PROTECTED } from "./glossary.js";

const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PROTECT_RE = new RegExp(`(${PROTECTED.map(escapeRe).join("|")})`, "g");

// Wrapped in <x>…</x> before sending; DeepL is told (tag_handling: "html",
// ignore_tags: ["x"]) to leave anything inside alone. Stripped again on the way
// back. One list, shared with validate.js via glossary.js — a term protected
// here and not there is how "YUnited" quietly becomes "Vereinigt" in event
// descriptions only.
export const protect = (s) => s.replace(PROTECT_RE, "<x>$1</x>");
export const unprotect = (s) => s.replace(/<\/?x>/g, "");

const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&#x27;": "'" };
export const decodeEntities = (s) => s.replace(/&(amp|lt|gt|quot|#39|#x27);/g, (m) => ENTITIES[m] ?? m);

// Serbian Cyrillic -> Serbian Latin (gaj). DeepL only emits Serbian in
// Cyrillic — target_lang "SR" has no Latin variant — but this site publishes
// Serbian in Latin: src/i18n/config.js declares htmlLang "sr-Latn" and
// dateLocale "sr-Latn-RS". Without this conversion every run would quietly
// reintroduce Cyrillic.
//
// Љ Њ Џ are the only awkward ones: they become two Latin letters, so the case
// of the SECOND letter depends on context — "LJ" inside an all-caps word,
// "Lj" at the start of a normal one.
const CYR_LATIN = {
  А:"A",Б:"B",В:"V",Г:"G",Д:"D",Ђ:"Đ",Е:"E",Ж:"Ž",З:"Z",И:"I",Ј:"J",К:"K",
  Л:"L",М:"M",Н:"N",О:"O",П:"P",Р:"R",С:"S",Т:"T",Ћ:"Ć",У:"U",Ф:"F",Х:"H",
  Ц:"C",Ч:"Č",Ш:"Š",
  а:"a",б:"b",в:"v",г:"g",д:"d",ђ:"đ",е:"e",ж:"ž",з:"z",и:"i",ј:"j",к:"k",
  л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",ћ:"ć",у:"u",ф:"f",х:"h",
  ц:"c",ч:"č",ш:"š",
};
const CYR_DIGRAPH_UPPER = { Љ: "LJ", Њ: "NJ", Џ: "DŽ" };
const CYR_DIGRAPH_LOWER = { љ: "lj", њ: "nj", џ: "dž" };
const CYR_IS_UPPER = new Set([...Object.keys(CYR_DIGRAPH_UPPER), ..."АБВГДЂЕЖЗИЈКЛМНОПРСТЋУФХЦЧШ"]);

export function toSerbianLatin(text) {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch in CYR_DIGRAPH_UPPER) {
      const pair = CYR_DIGRAPH_UPPER[ch];
      out += CYR_IS_UPPER.has(text[i + 1]) ? pair : pair[0] + pair[1].toLowerCase();
    } else if (ch in CYR_DIGRAPH_LOWER) {
      out += CYR_DIGRAPH_LOWER[ch];
    } else {
      out += CYR_LATIN[ch] ?? ch;
    }
  }
  return out;
}

// Two habits DeepL has that need undoing on every run, neither a judgement
// call:
//
// 1. It quotes the terms we asked it not to translate — „HSG", „uniclubs"-Konto,
//    &quot;YUnited&quot;. These are names; the quotes are never wanted.
// 2. For German it writes German-German ß. This is a Swiss club and the rest
//    of the copy is Swiss orthography (ausschliesslich, heissen, grosse), so ß
//    is simply wrong here.
const QUOTED_PROTECT = new RegExp(`[„“"«»](${PROTECTED.map(escapeRe).join("|")})[„“"«»]`, "g");

export function postProcess(text, code) {
  let out = decodeEntities(unprotect(text)).replace(QUOTED_PROTECT, "$1");
  if (code === "de") out = out.replace(/ß/g, "ss");
  if (code === "sr") out = toSerbianLatin(out);
  return out;
}

// Placeholders present in the source that did not come back. Protecting a
// {placeholder} stops DeepL translating it but does NOT stop it dropping one:
// asked for Serbian, it once returned "Портрет Елзе Јанец" for
// "Portrait of {name}" — placeholder gone, invented person in its place.
export function lostPlaceholders(source, translated) {
  const want = String(source).match(/\{\w+\}/g) ?? [];
  return want.filter((p) => !translated.includes(p));
}

export function apiUrlFor(apiKey) {
  // Keys ending in ":fx" are DeepL API Free; everything else is Pro.
  return apiKey.endsWith(":fx")
    ? "https://api-free.deepl.com/v2/translate"
    : "https://api.deepl.com/v2/translate";
}

/** DeepL's usage endpoint, on whichever host the key belongs to. */
const usageUrlFor = (apiKey) => apiUrlFor(apiKey).replace(/\/translate$/, "/usage");

/**
 * How much of this month's allowance is gone — and, incidentally, whether the
 * key works at all.
 *
 * This call costs no quota, which is what makes it usable as a liveness probe:
 * /admin verifies a pasted key with it before storing it, so a typo is caught
 * where the board can read it rather than at the next save.
 *
 * @returns {Promise<{count: number, limit: number}>}
 */
export async function usage({ apiKey, fetchImpl = globalThis.fetch, signal } = {}) {
  const res = await fetchImpl(usageUrlFor(apiKey), {
    headers: { Authorization: `DeepL-Auth-Key ${apiKey}` },
    signal,
  });
  if (!res.ok) {
    throw Object.assign(new Error(`DeepL ${res.status} ${res.statusText}: ${await res.text()}`), {
      status: res.status,
      service: "deepl",
    });
  }
  const data = await res.json();
  return { count: data.character_count ?? 0, limit: data.character_limit ?? 0 };
}

/**
 * Translate one string, with optional surrounding context.
 *
 * `context` is DeepL's context parameter: extra text that helps disambiguate
 * the string WITHOUT being translated itself and without counting toward the
 * character quota. Only one value per request, which is why this function
 * takes a single string rather than a batch — see translateSet below.
 */
async function deeplTranslate(
  text,
  targetLang,
  { apiKey, sourceLang, context, fetchImpl = globalThis.fetch, signal } = {},
) {
  const url = apiUrlFor(apiKey);
  const body = {
    text: [protect(text)],
    target_lang: targetLang,
    tag_handling: "html", // preserves <a>/<strong> in the marked-up strings
    ignore_tags: ["x"], //   ...and our brand-term wrappers
  };
  if (sourceLang) body.source_lang = sourceLang;
  if (context) body.context = protect(context);

  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    // `status` and `service` are what the Worker branches on to tell the board
    // "wait a minute" (429) apart from "the key was rejected" (403).
    throw Object.assign(new Error(`DeepL ${res.status} ${res.statusText}: ${await res.text()}`), {
      status: res.status,
      service: "deepl",
    });
  }
  const data = await res.json();
  const [translation] = data.translations ?? [];
  if (!translation) throw new Error("DeepL returned no translation.");
  return { text: translation.text, detected: translation.detected_source_language ?? null };
}

/**
 * Context for one item: a hand-written note (see NOTES in translate.mjs, or
 * the sibling field in translate-content.mjs), plus — if the item is part of a
 * split Pre/Link/Post sentence — the sentence joined back together. Both are
 * DISAMBIGUATING TEXT, not instructions; DeepL cannot be told a rule, only
 * shown more of the sentence.
 */
function contextFor(item, groups) {
  const parts = [];
  if (item.note) parts.push(item.note);
  for (const g of Object.values(groups)) {
    if (g.Pre !== item.key && g.Link !== item.key && g.Post !== item.key) continue;
    const sentence = ["Pre", "Link", "Post"]
      .map((p) => (g[p] ? item.all?.find((i) => i.key === g[p])?.source ?? "" : ""))
      .join("");
    parts.push(`Part of one sentence split around a link: "${sentence}"`);
    break;
  }
  return parts.length ? parts.join(" — ") : undefined;
}

/**
 * Translate a complete set of strings into one target language, one DeepL
 * request per string (the `context` parameter is request-wide, not per-text,
 * so a shared batch call cannot give each string its own context).
 *
 * @param {object} options
 * @param {{key: string, source: string, note?: string}[]} options.items
 * @param {string} options.code       target dictionary code (hr/bs/sr/de)
 * @param {string} options.apiKey
 * @param {string} [options.sourceLang] source dictionary code; defaults to "en"
 * @param {Record<string, Record<string,string>>} [options.groups] split-sentence groups
 * @param {typeof fetch} [options.fetchImpl] injected for tests and for the Worker
 * @param {AbortSignal} [options.signal] one budget for a whole batch of calls
 * @returns {Promise<{ values: Record<string,string>, usage: {charsIn: number, charsOut: number} }>}
 */
export async function translateSet({
  items,
  code,
  apiKey,
  sourceLang = "en",
  groups = {},
  fetchImpl,
  signal,
}) {
  const targetLang = code.toUpperCase();
  const withAll = items.map((item) => ({ ...item, all: items }));

  const values = {};
  let charsIn = 0;
  let charsOut = 0;

  for (const item of withAll) {
    const { text } = await deeplTranslate(item.source, targetLang, {
      apiKey,
      // No source_lang when the caller doesn't know it: asserting EN over
      // Croatian text produces confident garbage, where DeepL's own detection
      // gets it right. See detectSourceLang.
      sourceLang: sourceLang ? sourceLang.toUpperCase() : undefined,
      context: contextFor(item, groups),
      fetchImpl,
      signal,
    });
    values[item.key] = postProcess(text, code);
    charsIn += item.source.length;
    charsOut += text.length;
  }

  return { values, usage: { charsIn, charsOut } };
}

/**
 * Translate a set, then ask again for anything that came back empty.
 *
 * A dropped key is the most invisible defect available here: the page still
 * renders, silently in the source language, and nothing fails.
 */
export async function translateSetComplete({
  items,
  code,
  apiKey,
  sourceLang = "en",
  groups = {},
  fetchImpl,
  signal,
  // A script prints an indented line under the language it is working on; the
  // Worker writes one flat "[translate] …" line that `wrangler tail` can be
  // grepped for. A library that hardcodes console formatting serves neither.
  onNote = (message) => console.warn(`  ${message}`),
}) {
  const { values, usage } = await translateSet({ items, code, apiKey, sourceLang, groups, fetchImpl, signal });

  const missing = items.filter((i) => typeof values[i.key] !== "string" || values[i.key].trim() === "");
  if (missing.length === 0) return { values, usage };

  onNote(`${code}: ${missing.length} key(s) came back empty — asking again for those`);
  const retry = await translateSet({
    items: missing,
    code,
    apiKey,
    sourceLang,
    groups: {},
    fetchImpl,
    signal,
  });
  return { values: { ...values, ...retry.values }, usage };
}

/**
 * Which language did the board actually write this entry in?
 *
 * DeepL returns `detected_source_language` on every call for free, so this
 * translates the text once (target is arbitrary — "EN" always exists) purely
 * to read that field off the response.
 *
 * Returns null rather than throwing, and rather than guessing "en": a caller
 * that knows the language should pass it to DeepL, and a caller that does not
 * should pass nothing and let DeepL decide per request. Asserting the wrong
 * source_lang is worse than asserting none — "translate this Croatian text,
 * which is English" produces fluent nonsense.
 *
 * @returns {Promise<string|null>} a code from `allowed`, or null
 */
export async function detectSourceLang(texts, { apiKey, allowed, fetchImpl, signal }) {
  const sample = texts.filter(Boolean).join("\n\n");
  if (!sample) return null;
  try {
    const { detected } = await deeplTranslate(sample, "EN", { apiKey, fetchImpl, signal });
    const code = detected?.toLowerCase();
    return code && allowed.includes(code) ? code : null;
  } catch {
    return null;
  }
}

/** Cost-visible summary, so a run says what it spent — in characters, DeepL's
 * billing unit, not tokens. */
export function formatUsage(usage) {
  if (!usage) return "";
  return `(${usage.charsIn ?? 0} chars in, ${usage.charsOut ?? 0} chars out)`;
}
