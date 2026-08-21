// DeepL plumbing for the two translation scripts:
//   translate.mjs          — the UI dictionaries in src/i18n/
//   translate-content.mjs  — the board's content in content/
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
//   * scripts/lib/validate.mjs, unchanged by this swap — it checks the output,
//     not the process, so it is the real net regardless of which engine wrote
//     the text. NOTHING IS WRITTEN until it passes.
//
// Terminology pinning has no live enforcement here: DeepL glossaries do not
// exist for en->hr/bs/sr (checked against the live API, PLAN.md §4). validate.mjs
// asserts the canonical term as a warning, not silently.
//
// NOT PART OF THE BUILD. `npm run build` never calls this — the build stays
// hermetic, which is load-bearing in CLAUDE.md.

import { PROTECTED } from "./glossary.mjs";

const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PROTECT_RE = new RegExp(`(${PROTECTED.map(escapeRe).join("|")})`, "g");

// Wrapped in <x>…</x> before sending; DeepL is told (tag_handling: "html",
// ignore_tags: ["x"]) to leave anything inside alone. Stripped again on the way
// back. One list, shared with validate.mjs via glossary.mjs — a term protected
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

export function requireApiKey(scriptName = "translate") {
  const apiKey = process.env.DEEPL_API_KEY;
  if (!apiKey) {
    console.error(
      "DEEPL_API_KEY is not set.\n" +
        "Locally: copy .env.example to .env and paste your key (get one at\n" +
        "https://www.deepl.com/pro-api — the free tier's 1,000,000 chars/month is\n" +
        `plenty here), then run:  npm run ${scriptName}\n` +
        "In CI: add DEEPL_API_KEY to the repository's Actions secrets.\n" +
        "The site build never needs this and stays hermetic.",
    );
    process.exit(1);
  }
  return apiKey;
}

/**
 * Translate one string, with optional surrounding context.
 *
 * `context` is DeepL's context parameter: extra text that helps disambiguate
 * the string WITHOUT being translated itself and without counting toward the
 * character quota. Only one value per request, which is why this function
 * takes a single string rather than a batch — see translateSet below.
 */
async function deeplTranslate(text, targetLang, { apiKey, sourceLang, context } = {}) {
  const url = apiUrlFor(apiKey);
  const body = {
    text: [protect(text)],
    target_lang: targetLang,
    tag_handling: "html", // preserves <a>/<strong> in the marked-up strings
    ignore_tags: ["x"], //   ...and our brand-term wrappers
  };
  if (sourceLang) body.source_lang = sourceLang;
  if (context) body.context = protect(context);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`DeepL ${res.status} ${res.statusText}: ${await res.text()}`);
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
 * @returns {Promise<{ values: Record<string,string>, usage: {charsIn: number, charsOut: number} }>}
 */
export async function translateSet({ items, code, apiKey, sourceLang = "en", groups = {} }) {
  const targetLang = code.toUpperCase();
  const withAll = items.map((item) => ({ ...item, all: items }));

  const values = {};
  let charsIn = 0;
  let charsOut = 0;

  for (const item of withAll) {
    const { text } = await deeplTranslate(item.source, targetLang, {
      apiKey,
      sourceLang: sourceLang.toUpperCase(),
      context: contextFor(item, groups),
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
export async function translateSetComplete({ items, code, apiKey, sourceLang = "en", groups = {} }) {
  const { values, usage } = await translateSet({ items, code, apiKey, sourceLang, groups });

  const missing = items.filter((i) => typeof values[i.key] !== "string" || values[i.key].trim() === "");
  if (missing.length === 0) return { values, usage };

  console.warn(`  ${code}: ${missing.length} key(s) came back empty — asking again for those`);
  const retry = await translateSet({ items: missing, code, apiKey, sourceLang, groups: {} });
  return { values: { ...values, ...retry.values }, usage };
}

/**
 * Which language did the board actually write this entry in?
 *
 * DeepL returns `detected_source_language` on every call for free, so this
 * translates the text once (target is arbitrary — "EN" always exists) purely
 * to read that field off the response. Falls back to "en" rather than
 * throwing: a wrong guess costs one redundant translation, while an exception
 * would block the board's save from being localized at all.
 */
export async function detectSourceLang(texts, { apiKey, allowed }) {
  const sample = texts.filter(Boolean).join("\n\n");
  if (!sample) return "en";
  try {
    const { detected } = await deeplTranslate(sample, "EN", { apiKey });
    const code = detected?.toLowerCase();
    return code && allowed.includes(code) ? code : "en";
  } catch {
    return "en";
  }
}

/** Cost-visible summary, so a run says what it spent — in characters, DeepL's
 * billing unit, not tokens. */
export function formatUsage(usage) {
  if (!usage) return "";
  return `(${usage.charsIn ?? 0} chars in, ${usage.charsOut ?? 0} chars out)`;
}
