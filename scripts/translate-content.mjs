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
// DeepL which language that was — a translate call to DeepL returns
// `detected_source_language` for free — then fills in the others, giving each
// field the other as DeepL `context` (not translated, not billed) so a title
// and its description translate as the same event rather than in isolation.
// The source text is fingerprinted into `i18n.sourceHash`; when someone edits a title or
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

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { detectSourceLang, formatUsage, translateSetComplete } from "../src/lib/translate/deepl.js";
import { requireApiKey } from "./lib/require-api-key.mjs";
import { DICTS, TRANSLATABLE, gate, mergeTranslations, planFor } from "../src/lib/translate/content.js";
import { formatFindings } from "../src/lib/translate/validate.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// WHAT NEEDS TRANSLATING is not decided here. TRANSLATABLE, the source hash,
// the up-to-date rule and the merge rules all live in
// src/lib/translate/content.js, because /admin's Worker translates the same
// entries on the same rules when the board presses Save. Two copies of "is
// this current?" would not fail loudly — the panel would just re-translate
// what this script thinks is finished, over hand corrections.

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");

const apiKey = dryRun ? (process.env.DEEPL_API_KEY ?? "") : requireApiKey("translate:content");

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

    const existing = entry.i18n ?? null;
    const { state, hash, nonEmpty, targets } = await planFor(entry, { fields, force });

    if (targets.length === 0) { skipped++; continue; }

    if (dryRun) {
      console.log(`${collection}/${name}: would translate ${nonEmpty.join(", ")}`);
      changed++;
      continue;
    }

    // null when DeepL couldn't tell (or answered with a language this site has
    // no dictionary for). Recorded as "en", but passed on as null so each
    // request lets DeepL detect for itself rather than being told a guess.
    const detected = await detectSourceLang(
      nonEmpty.map((f) => String(entry[f])),
      { apiKey, allowed: DICTS },
    );
    const sourceDict = detected ?? "en";

    const machine = {};
    let entryFailed = false;

    for (const dict of targets) {
      // The authored text already serves the language it was written in.
      // `planFor` cannot know that language — it is detected above, one call
      // per entry — so this is where the source dictionary drops out.
      if (dict === sourceDict) continue;

      // DeepL's context isn't translated and doesn't count toward the quota —
      // give each field the OTHER one as context, so a title and its
      // description translate as the same event rather than two unrelated
      // strings.
      const items = nonEmpty.map((f) => ({
        key: f,
        source: String(entry[f]),
        note: nonEmpty
          .filter((other) => other !== f)
          .map((other) => `The event's ${other}: ${JSON.stringify(String(entry[other]))}`)
          .join(" "),
      }));
      const { values, usage } = await translateSetComplete({ items, code: dict, apiKey, sourceLang: detected });

      // THE GATE, per entry. On an error nothing is written for this entry —
      // a half-translated event is worse than an untranslated one.
      const { findings, errors } = gate({ entry, i18n: { [dict]: values }, fields, label: name });
      if (errors.length) {
        console.error(formatFindings(findings, `${collection}/${name} [${dict}]`));
        entryFailed = true;
        break;
      }

      for (const f of nonEmpty) {
        const before = existing?.[dict]?.[f];
        if (before !== values[f]) report.push({ file: name, dict, field: f, before, after: values[f] });
      }
      machine[dict] = values;
      console.log(`  ${name} [${dict}] ${formatUsage(usage)}`);
    }

    if (entryFailed) {
      console.error(`${collection}/${name}: validation failed — left unchanged.`);
      failed++;
      continue;
    }

    // Same merge the Worker performs on a board member's save: a stale entry
    // drops its old block, a current one keeps every translation this run did
    // not produce. `state` is only reported, never re-derived here.
    entry.i18n = mergeTranslations({ existing, machine, hash, sourceLang: sourceDict, fields });
    writeEntry(file, entry);
    console.log(`${collection}/${name}: ${state}, source=${sourceDict}, translated ${nonEmpty.join(", ")}`);
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
