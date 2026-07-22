// Shared DeepL plumbing for the two translation scripts:
//   translate.mjs          — the UI dictionaries in src/i18n/
//   translate-content.mjs  — the board's content in content/
//
// Both need the same brand-protection list and the same corrections applied to
// what comes back, and a term protected in one place must be protected in the
// other. Keeping this in one module is the point — a divergent PROTECT list is
// how "YUnited" quietly becomes "Vereinigt" in event descriptions only.

// Proper nouns / brand tokens that must never be translated. They are wrapped
// in <x>…</x> before sending and DeepL is told to ignore that tag; the wrapper
// is stripped again afterwards. Longest first so "uniclubs.ch" wins over
// "uniclubs" in the single-pass match.
export const PROTECT = [
  "uniclubs.ch",
  "uniclubs",
  "yunited@shsg.ch",
  "@yunited.unisg",
  "YUnited",
  "HSG",
  "St. Gallen",
  "Instagram",
  "Formspree",
  "CHF",
  // Event/venue proper nouns. These appear in content/events/*.json and are
  // names, not phrases — "Prvi Maj" is the event's name, not a date to render
  // into German.
  "Prvi Maj",
  "AIESEC",
  "SHSG",
  // {placeholders} filled by t(key, vars) at render time — DeepL must return
  // them byte-identical or the interpolation silently stops matching.
  "{title}",
  "{name}",
].sort((a, b) => b.length - a.length);

const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const PROTECT_RE = new RegExp(`(${PROTECT.map(escapeRe).join("|")})`, "g");

export const protect = (s) => s.replace(PROTECT_RE, "<x>$1</x>");
export const unprotect = (s) => s.replace(/<\/?x>/g, "");

const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&#x27;": "'" };
export const decodeEntities = (s) =>
  s.replace(/&(amp|lt|gt|quot|#39|#x27);/g, (m) => ENTITIES[m] ?? m);

// Two habits DeepL has that need undoing on every run:
//
// 1. It quotes the terms we asked it not to translate — „HSG“, „uniclubs“-Konto,
//    &quot;YUnited&quot;. The quotes are never wanted; these are names.
// 2. For German it writes German-German ß. This is a Swiss club and the rest of
//    the copy is Swiss orthography (ausschliesslich, heissen, grosse), so ß is
//    simply wrong here.
//
// Neither is a judgement call, so fix both automatically.
const QUOTED_PROTECT = new RegExp(`[„“"«»](${PROTECT.map(escapeRe).join("|")})[„“"«»]`, "g");

export function postProcess(text, dict) {
  let out = text.replace(QUOTED_PROTECT, "$1");
  if (dict === "de") out = out.replace(/ß/g, "ss");
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
        "https://www.deepl.com/pro-api — the free tier's 500k chars/month is\n" +
        `plenty here), then run:  npm run ${scriptName}\n` +
        "In CI: add DEEPL_API_KEY to the repository's Actions secrets.",
    );
    process.exit(1);
  }
  return apiKey;
}

/**
 * Translate a batch of strings.
 *
 * `sourceLang` may be null, in which case DeepL detects it and the detected
 * language is returned alongside each result — that is how translate-content
 * works out which language a board member wrote an event in.
 *
 * Returns [{ text, detected }].
 */
export async function deeplBatch(texts, targetLang, { apiKey, sourceLang = "EN" } = {}) {
  const out = [];
  const CHUNK = 40; // DeepL allows 50 text params/request; stay under it.
  const url = apiUrlFor(apiKey);

  for (let i = 0; i < texts.length; i += CHUNK) {
    const slice = texts.slice(i, i + CHUNK);
    const body = {
      text: slice.map(protect),
      target_lang: targetLang,
      tag_handling: "html", // preserves <a>/<strong> in the marked-up strings
      ignore_tags: ["x"], //   ...and our brand-term wrappers
    };
    if (sourceLang) body.source_lang = sourceLang;

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
    out.push(
      ...data.translations.map((t) => ({
        text: t.text,
        detected: t.detected_source_language ?? null,
      })),
    );
  }
  return out;
}
