// Translates the board's CONTENT (content/events/*.json, content/members/*.json)
// into every locale, and keeps those translations current as entries are edited.
//
//   npm run translate:content              # translate what needs it
//   npm run translate:content -- --dry-run # report only, write nothing
//   npm run translate:content -- --force   # re-translate everything
//
// Run by hand, or automatically by .github/workflows/translate-content.yml when
// a board member saves through the CMS (every CMS save is a commit).
//
// HOW IT DECIDES WHAT TO DO
//
// The board writes an entry in whatever language suits them. This script asks
// DeepL which language that was, then fills in the others. The source text is
// fingerprinted into `i18n.sourceHash`; when someone edits a title or
// description the hash stops matching and that entry is translated again. An
// entry whose hash still matches and whose translations are all present is
// skipped, so re-running this costs nothing.
//
// WHAT IT WILL NOT TOUCH
//
// Only the fields listed in TRANSLATABLE. Notably NOT an event's `location`:
// those are venue names and street addresses ("Déja Vu Bar, St. Gallen",
// "Zürcherstrasse 162"), and translating them corrupts directions to a real
// place. Not member `role` either — board titles are used in English at HSG.
//
// The build never runs this. It stays hermetic: no network, no secrets.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Which fields may be translated, per collection.
const TRANSLATABLE = {
  events: ["title", "description"],
  members: ["bio"],
};

// Dictionary name -> DeepL language code. Mirrors src/i18n/config.js `dict`
// values; bs and hr share `bcs`, so one translation serves both.
const DICT_LANG = {
  en: "EN-GB",
  de: "DE",
  bcs: "HR",
  sr: "SR",
};

// DeepL's detected_source_language (ISO-ish) -> our dictionary name.
const DETECTED_TO_DICT = {
  EN: "en",
  DE: "de",
  HR: "bcs",
  BS: "bcs",
  SR: "sr",
};

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");

const apiKey = dryRun ? process.env.DEEPL_API_KEY ?? "" : requireApiKey("translate:content");

// Fingerprint of the source text, so an edit invalidates stale translations.
function hashSource(entry, fields) {
  const h = createHash("sha256");
  for (const f of fields) h.update(String(entry[f] ?? ""), "utf8");
  return h.digest("hex").slice(0, 16);
}

function readEntry(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

// Match the formatting the CMS and the existing files use, so an auto-commit
// does not show up as a whole-file reformat in the diff.
function writeEntry(file, data) {
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

let changed = 0;
let skipped = 0;
let warnings = 0;

for (const [collection, fields] of Object.entries(TRANSLATABLE)) {
  const dir = join(ROOT, "content", collection);
  let files;
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  } catch {
    continue; // collection doesn't exist — nothing to do
  }

  for (const name of files) {
    const file = join(dir, name);
    const entry = readEntry(file);

    // Nothing worth translating (e.g. a member whose bio is still empty).
    const hasText = fields.some((f) => String(entry[f] ?? "").trim() !== "");
    if (!hasText) { skipped++; continue; }

    const hash = hashSource(entry, fields);
    const existing = entry.i18n ?? null;
    const upToDate =
      existing &&
      existing.sourceHash === hash &&
      Object.keys(DICT_LANG).every(
        (d) => d === existing.sourceLang || (existing[d] && fields.every((f) =>
          String(entry[f] ?? "").trim() === "" || existing[d][f])),
      );

    if (upToDate && !force) { skipped++; continue; }

    const sourceTexts = fields.map((f) => String(entry[f] ?? ""));
    const nonEmpty = fields.filter((f) => String(entry[f] ?? "").trim() !== "");

    if (dryRun) {
      console.log(`${collection}/${name}: would translate ${nonEmpty.join(", ")}`);
      changed++;
      continue;
    }

    // First pass detects the language the board wrote in. Ask for English; if
    // the entry already IS English, DeepL says so and we keep the original.
    const probe = await deeplBatch(sourceTexts, "EN-GB", { apiKey, sourceLang: null });
    const detected = probe.find((p) => p.detected)?.detected ?? "EN";
    const sourceDict = DETECTED_TO_DICT[detected] ?? "en";

    const i18n = { sourceLang: sourceDict, sourceHash: hash };

    for (const [dict, lang] of Object.entries(DICT_LANG)) {
      if (dict === sourceDict) continue; // the authored text already serves this one

      // Reuse the probe for English rather than paying for it twice.
      const results =
        dict === "en" && sourceDict !== "en"
          ? probe
          : await deeplBatch(sourceTexts, lang, { apiKey, sourceLang: null });

      const out = {};
      fields.forEach((f, i) => {
        const source = String(entry[f] ?? "");
        if (source.trim() === "") return;
        let value = postProcess(decodeEntities(unprotect(results[i].text)), dict);
        out[f] = value;

        const missing = lostPlaceholders(source, value);
        if (missing.length) {
          console.warn(`  ⚠ ${collection}/${name} [${dict}.${f}] lost ${missing.join(", ")}: "${value}"`);
          warnings++;
        }
      });
      i18n[dict] = out;
    }

    entry.i18n = i18n;
    writeEntry(file, entry);
    console.log(`${collection}/${name}: source=${sourceDict}, translated ${nonEmpty.join(", ")}`);
    changed++;
  }
}

console.log(
  `\n${dryRun ? "[dry run] " : ""}${changed} entr${changed === 1 ? "y" : "ies"} ` +
    `updated, ${skipped} already current.`,
);
if (warnings) {
  console.warn(`${warnings} translation(s) came back missing a placeholder — review before publishing.`);
  process.exitCode = 1;
}
