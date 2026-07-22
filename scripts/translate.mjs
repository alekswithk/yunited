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
import {
  decodeEntities,
  deeplBatch,
  lostPlaceholders,
  postProcess,
  requireApiKey,
  unprotect,
} from "./lib/deepl.mjs";

const I18N_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "i18n");

// dictionary file -> DeepL target language code.
const TARGETS = {
  de: "DE",
  bcs: "HR",
  sr: "SR",
};

const args = process.argv.slice(2);
const force = args.includes("--force");
const onlyDicts = args.filter((a) => !a.startsWith("--"));

const apiKey = requireApiKey("translate");

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

let hadWarnings = false;

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
  const translated = await deeplBatch(sources, targetLang, { apiKey });

  const fresh = {};
  const suspect = [];
  keys.forEach((k, i) => {
    let value = unprotect(translated[i].text);
    // Plain strings render through auto-escaping {t()}, so they must be raw
    // text — undo any entity encoding DeepL added. Marked-up strings render
    // via set:html and keep their entities/tags as-is.
    if (!String(enFlat[k]).includes("<")) value = decodeEntities(value);
    fresh[k] = value;

    // Placeholder integrity. Protecting a {placeholder} stops DeepL translating
    // it but does NOT stop it dropping one: asked for Serbian, it once returned
    // "Портрет Елзе Јанец" for "Portrait of {name}" — placeholder gone and an
    // invented person in its place. A lost placeholder means t(key, vars) silently
    // stops substituting, so flag it rather than let it reach a page.
    const missing = lostPlaceholders(enFlat[k], value);
    if (missing.length) suspect.push(`${k} — lost ${missing.join(", ")}: "${value}"`);
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

  if (suspect.length) {
    console.warn(`  ⚠ ${dict}.json: ${suspect.length} string(s) came back with a`);
    console.warn(`    placeholder missing — fix these by hand before committing:`);
    for (const line of suspect) console.warn(`      • ${line}`);
    hadWarnings = true;
  }
}

console.log("Done. Review the output, then flip complete:true in src/i18n/config.js when a locale is finished.");
if (hadWarnings) {
  console.warn("\nSome strings need a hand-fix before committing (see ⚠ above).");
  process.exitCode = 1;
}
