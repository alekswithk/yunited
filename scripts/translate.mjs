// One-time, offline translation helper. Fills the locale dictionaries in
// src/i18n/ from the English source (en.json) using the DeepL API.
//
// Put your key in a .env file (copy .env.example -> .env); it is gitignored.
// `npm run translate` loads it automatically (via --env-file-if-exists), so:
//
//   npm run translate                    # fill only missing keys
//   npm run translate -- --force         # re-translate everything
//   npm run translate -- de sr           # only these dictionaries
//
// An inline env var still works too: `DEEPL_API_KEY=xxxx npm run translate`.
//
// This is NOT part of the build. The build stays hermetic (no network, no
// secrets) — you run this by hand, review the machine translation, and commit
// the resulting JSON. New body copy in en.json can be topped up any time by
// re-running it; existing (hand-checked) translations are preserved unless you
// pass --force.
//
// DeepL now covers all four target languages, so one key does the lot:
//   de.json  <- DE          sr.json <- SR (Ekavian)
//   bcs.json <- HR (Ijekavian, shared by the bs + hr locales)

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const I18N_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "i18n");

// dictionary file -> DeepL target language code.
const TARGETS = {
  de: "DE",
  bcs: "HR",
  sr: "SR",
};

// Proper nouns / brand tokens that must never be translated. They are wrapped
// in <x>…</x> before sending and DeepL is told to ignore that tag; the wrapper
// is stripped again afterwards. Longest first so "uniclubs.ch" wins over
// "uniclubs" in the single-pass match.
const PROTECT = [
  "uniclubs.ch",
  "uniclubs",
  "yunited@shsg.ch",
  "@yunited.unisg",
  "Yunited",
  "HSG",
  "St. Gallen",
  "Instagram",
  "Formspree",
  "CHF",
].sort((a, b) => b.length - a.length);

const PROTECT_RE = new RegExp(
  `(${PROTECT.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
  "g",
);

const args = process.argv.slice(2);
const force = args.includes("--force");
const onlyDicts = args.filter((a) => !a.startsWith("--"));

const apiKey = process.env.DEEPL_API_KEY;
if (!apiKey) {
  console.error(
    "DEEPL_API_KEY is not set.\n" +
      "Copy .env.example to .env and paste your key (get one at\n" +
      "https://www.deepl.com/pro-api — the free tier's 500k chars/month is\n" +
      "plenty here), then run:  npm run translate",
  );
  process.exit(1);
}

// Keys ending in ":fx" are DeepL API Free; everything else is Pro.
const API_URL = apiKey.endsWith(":fx")
  ? "https://api-free.deepl.com/v2/translate"
  : "https://api.deepl.com/v2/translate";

const readJson = (name) => JSON.parse(readFileSync(join(I18N_DIR, `${name}.json`), "utf8"));

// { "a.b.c": "value" } <-> nested object, walking in en.json's key order.
function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

function setDeep(obj, dottedKey, value) {
  const parts = dottedKey.split(".");
  let node = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    node[parts[i]] ??= {};
    node = node[parts[i]];
  }
  node[parts[parts.length - 1]] = value;
}

const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&#x27;": "'" };
const decodeEntities = (s) => s.replace(/&(amp|lt|gt|quot|#39|#x27);/g, (m) => ENTITIES[m] ?? m);

const protect = (s) => s.replace(PROTECT_RE, "<x>$1</x>");
const unprotect = (s) => s.replace(/<\/?x>/g, "");

// Two habits DeepL has that need undoing every single run:
//
// 1. It quotes the terms we asked it not to translate — "Der Start bei „HSG“",
//    „uniclubs“-Konto, &quot;YUnited&quot;. The quotes are never wanted; these
//    are names, not citations.
// 2. For German it writes German-German ß. This is a Swiss club and the rest of
//    the copy is Swiss orthography (ausschliesslich, heissen, grosse), so ß is
//    simply wrong here.
//
// Neither is a judgement call, so fix both automatically rather than by hand.
const QUOTED_PROTECT = new RegExp(
  `[„“"«»](${PROTECT.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})[„“"«»]`,
  "g",
);

function postProcess(text, dict) {
  let out = text.replace(QUOTED_PROTECT, "$1");
  if (dict === "de") out = out.replace(/ß/g, "ss");
  return out;
}

async function deeplBatch(texts, targetLang) {
  const out = [];
  const CHUNK = 40; // DeepL allows 50 text params/request; stay under it.
  for (let i = 0; i < texts.length; i += CHUNK) {
    const slice = texts.slice(i, i + CHUNK);
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: slice.map(protect),
        source_lang: "EN",
        target_lang: targetLang,
        tag_handling: "html", // preserves <a>/<strong> in the marked-up strings
        ignore_tags: ["x"], // ...and our brand-term wrappers
      }),
    });
    if (!res.ok) {
      throw new Error(`DeepL ${res.status} ${res.statusText}: ${await res.text()}`);
    }
    const data = await res.json();
    out.push(...data.translations.map((t) => t.text));
  }
  return out;
}

const en = readJson("en");
const enFlat = flatten(en);
const dictNames = Object.keys(TARGETS).filter((d) => onlyDicts.length === 0 || onlyDicts.includes(d));

for (const dict of dictNames) {
  const targetLang = TARGETS[dict];
  const existing = flatten(readJson(dict));

  // Which English keys still need a translation in this dictionary?
  const keys = Object.keys(enFlat).filter((k) => {
    const cur = existing[k];
    return force || cur === undefined || cur === "";
  });

  if (keys.length === 0) {
    console.log(`${dict}.json (${targetLang}): nothing to do — up to date.`);
    continue;
  }

  console.log(`${dict}.json (${targetLang}): translating ${keys.length} key(s)…`);
  const sources = keys.map((k) => String(enFlat[k]));
  const translated = await deeplBatch(sources, targetLang);

  const fresh = {};
  keys.forEach((k, i) => {
    let value = unprotect(translated[i]);
    // Plain strings render through auto-escaping {t()}, so they must be raw
    // text — undo any entity encoding DeepL added. Marked-up strings render
    // via set:html and keep their entities/tags as-is.
    if (!String(enFlat[k]).includes("<")) value = decodeEntities(value);
    value = postProcess(value, dict);
    fresh[k] = value;
  });

  // Rebuild the dictionary in en.json's shape and order: keep existing values,
  // drop in the fresh translations, and never emit keys en no longer has.
  const result = {};
  for (const k of Object.keys(enFlat)) {
    const value = k in fresh ? fresh[k] : existing[k] ?? enFlat[k];
    setDeep(result, k, value);
  }

  writeFileSync(join(I18N_DIR, `${dict}.json`), JSON.stringify(result, null, 2) + "\n");
  console.log(`  wrote ${dict}.json`);
}

console.log("Done. Review the output, then flip complete:true in src/i18n/config.js when a locale is finished.");
