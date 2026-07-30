// Translates the board's CONTENT (content/events/*.json) into every locale, and
// keeps those translations current as entries are edited.
//
//   npm run translate:content              # translate what needs it
//   npm run translate:content -- --dry-run # report only, write nothing
//   npm run translate:content -- --force   # re-translate everything
//
// Run by hand, or automatically by .github/workflows/translate-content.yml when
// a board member saves through /admin (every save is a commit).
//
// HOW IT DECIDES WHAT TO DO
//
// The board writes an entry in whatever language suits them. This script asks
// Claude which language that was, then fills in the others. The source text is
// fingerprinted into `i18n.sourceHash`; when someone edits a title or
// description the hash stops matching and that entry is translated again. An
// entry whose hash still matches and whose translations are all present is
// skipped, so re-running this costs nothing — and a hand-corrected translation
// survives until the source text itself changes.
//
// WHAT IT WILL NOT TOUCH
//
// Only the fields listed in TRANSLATABLE. Notably NOT an event's `location`:
// those are venue names and street addresses ("Déja Vu Bar, St. Gallen",
// "Zürcherstrasse 162"), and translating them corrupts directions to a real
// place. The old pipeline proved the point from the other side — it translated
// the venue INSIDE a description to "bar Deža Vju" while `location` on the same
// card still read "Déja Vu Bar", so the card showed both spellings at once.
//
// And NOT content/members/** or content/partners/** at all. A board member's
// name, role and bio are the same on every language's page: roles are used in
// English at HSG, and a bio is a person describing themselves in their own
// words, which machine translation mangles rather than serves. It once turned
// the bio "krastavac" into "Küstenfischer" on the German page.
//
// The build never runs this. It stays hermetic: no network, no secrets.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { detectSourceLang, formatUsage, requireApiKey, translateSetComplete } from "./lib/claude.mjs";
import { LANGUAGES } from "./lib/glossary.mjs";
import { checkString, errorsOf, formatFindings } from "./lib/validate.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Which fields may be translated, per collection. Members and partners are
// absent on purpose — see WHAT IT WILL NOT TOUCH above.
const TRANSLATABLE = {
  events: ["title", "description"],
};

// Dictionary names. Mirrors src/i18n/config.js `dict` values — bs and hr have
// their own dictionaries now, so an entry carries five blocks rather than four.
const DICTS = ["en", ...Object.keys(LANGUAGES)];

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");

const apiKey = dryRun ? (process.env.ANTHROPIC_API_KEY ?? "") : requireApiKey("translate:content");

/** Fingerprint of the source text, so an edit invalidates stale translations. */
function hashSource(entry, fields) {
  const h = createHash("sha256");
  for (const f of fields) h.update(String(entry[f] ?? ""), "utf8");
  return h.digest("hex").slice(0, 16);
}

const readEntry = (file) => JSON.parse(readFileSync(file, "utf8"));

// Match the formatting /admin and every hand-authored file already use, so an
// auto-commit shows up as the fields that changed and not a whole-file reformat.
const writeEntry = (file, data) => writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");

let changed = 0;
let skipped = 0;
let failed = 0;
const report = [];

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

    const hasText = fields.some((f) => String(entry[f] ?? "").trim() !== "");
    if (!hasText) { skipped++; continue; }

    const hash = hashSource(entry, fields);
    const existing = entry.i18n ?? null;
    const upToDate =
      existing &&
      existing.sourceHash === hash &&
      DICTS.every(
        (d) =>
          d === existing.sourceLang ||
          (existing[d] &&
            fields.every((f) => String(entry[f] ?? "").trim() === "" || existing[d][f])),
      );

    if (upToDate && !force) { skipped++; continue; }

    const nonEmpty = fields.filter((f) => String(entry[f] ?? "").trim() !== "");

    if (dryRun) {
      console.log(`${collection}/${name}: would translate ${nonEmpty.join(", ")}`);
      changed++;
      continue;
    }

    const sourceDict = await detectSourceLang(
      nonEmpty.map((f) => String(entry[f])),
      { apiKey, allowed: DICTS },
    );

    const i18n = { sourceLang: sourceDict, sourceHash: hash };
    let entryFailed = false;

    for (const dict of DICTS) {
      if (dict === sourceDict) continue; // the authored text already serves this one
      // `en` is in DICTS so that an entry written in German records that English
      // needs filling, but it has no LANGUAGES profile — it is the source
      // dictionary, not a target. `localizeEntry` falls back to the authored
      // text, so an English page shows the German original rather than nothing.
      if (!LANGUAGES[dict]) continue;

      const items = nonEmpty.map((f) => ({ key: f, source: String(entry[f]) }));
      const { values, usage } = await translateSetComplete({ items, code: dict, apiKey });

      // THE GATE, per field. On an error nothing is written for this entry —
      // a half-translated event is worse than an untranslated one.
      const findings = items.flatMap((i) =>
        checkString(i.source, values[i.key], `${name}:${dict}.${i.key}`, dict),
      );
      const errors = errorsOf(findings);
      if (errors.length) {
        console.error(formatFindings(findings, `${collection}/${name} [${dict}]`));
        entryFailed = true;
        break;
      }

      const out = {};
      for (const f of nonEmpty) {
        out[f] = values[f];
        const before = existing?.[dict]?.[f];
        if (before !== values[f]) report.push({ file: name, dict, field: f, before, after: values[f] });
      }
      i18n[dict] = out;
      console.log(`  ${name} [${dict}] ${formatUsage(usage)}`);
    }

    if (entryFailed) {
      console.error(`${collection}/${name}: validation failed — left unchanged.`);
      failed++;
      continue;
    }

    entry.i18n = i18n;
    writeEntry(file, entry);
    console.log(`${collection}/${name}: source=${sourceDict}, translated ${nonEmpty.join(", ")}`);
    changed++;
  }
}

// --- review report -----------------------------------------------------------

if (report.length) {
  const lines = ["", "## Content translation review", "", "| file | locale | field | before | after |", "|---|---|---|---|---|"];
  for (const r of report) {
    const cell = (v) => String(v ?? "—").replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 120);
    lines.push(`| \`${r.file}\` | ${r.dict} | ${r.field} | ${cell(r.before)} | ${cell(r.after)} |`);
  }
  const markdown = lines.join("\n");
  console.log(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) {
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, markdown, { flag: "a" });
  }
}

console.log(
  `\n${dryRun ? "[dry run] " : ""}${changed} entr${changed === 1 ? "y" : "ies"} updated, ` +
    `${skipped} already current${failed ? `, ${failed} failed validation` : ""}.`,
);

// A validation failure must fail the workflow: the "Verify the result still
// builds" step would pass (nothing was written), so this is the only signal.
if (failed) process.exitCode = 1;
