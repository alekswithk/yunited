// Offline translation of the UI dictionaries in src/i18n/ from en.json.
//
//   npm run translate                    # fill only missing keys
//   npm run translate -- --force         # re-translate everything
//   npm run translate -- hr bs           # only these dictionaries
//   npm run translate -- --dry-run       # report what would change, write nothing
//
// Put your key in a .env file (copy .env.example -> .env); it is gitignored, and
// `npm run translate` loads it automatically. An inline env var works too:
// `ANTHROPIC_API_KEY=xxx npm run translate`.
//
// NOT PART OF THE BUILD. The build stays hermetic — no network, no secrets. You
// run this by hand, read the review report, and commit the JSON.
//
// HOW THIS DIFFERS FROM THE DEEPL VERSION IT REPLACED
//
// The old script sent one string per request. This one sends the WHOLE
// dictionary in a single request per language, because almost every defect that
// shipped was a missing-context defect rather than a bad-dictionary defect:
//
//   * contact.formSending, a submit button's in-flight label, came back as the
//     imperative "Pošalji…" ("Send") — identical in force to the button's
//     resting label, so the button appeared not to react. With no context,
//     "Sending…" is genuinely ambiguous.
//   * about.buddyMoreLink ("exchange page") came back as "razmjena stranice" —
//     two nominatives glued together, because nothing told it the fragment
//     follows the preposition "na".
//   * The buddy system acquired four names per language.
//
// NOTHING IS WRITTEN UNTIL THE GATE PASSES. scripts/lib/validate.mjs checks the
// output before any file is touched; on an error the run aborts and the
// dictionaries are left exactly as they were. That gate exists because these
// defects are invisible to every other command in the repo: `npm test`,
// `npm run build`, `npm run check` and `npm run check:dist` all passed for
// months while the About page described a mating system.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { formatUsage, requireApiKey, translateSetComplete } from "./lib/claude.mjs";
import { LANGUAGES } from "./lib/glossary.mjs";
import { flatten, splitSentenceGroups, unflatten } from "./lib/flat.mjs";
import { checkDictionary, errorsOf, formatFindings } from "./lib/validate.mjs";

const I18N_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "i18n");

// German is not re-translated by default. It is hand-reviewed and live, and
// overwriting corrected copy to fix languages that are not German is a bad
// trade. Pass it explicitly (`npm run translate -- de --force`) to include it.
const DEFAULT_TARGETS = ["hr", "bs", "sr"];

const args = process.argv.slice(2);
const force = args.includes("--force");
const dryRun = args.includes("--dry-run");
const named = args.filter((a) => !a.startsWith("--"));
const targets = named.length ? named : DEFAULT_TARGETS;

for (const code of targets) {
  if (!LANGUAGES[code]) {
    console.error(`Unknown dictionary "${code}". Known: ${Object.keys(LANGUAGES).join(", ")}`);
    process.exit(1);
  }
}

const apiKey = dryRun ? (process.env.ANTHROPIC_API_KEY ?? "") : requireApiKey("translate");

const pathFor = (name) => join(I18N_DIR, `${name}.json`);
const readDict = (name) => JSON.parse(readFileSync(pathFor(name), "utf8"));

const enFlat = flatten(readDict("en"));
const groups = splitSentenceGroups(enFlat);

/**
 * Context notes attached to individual keys.
 *
 * A key name and an English string are not always enough to disambiguate.
 * `formSending` is the case that proves it: "Sending…" is a status, not a
 * command, and nothing in the string says so.
 */
const NOTES = {
  "contact.formSending": "Status label shown ON the submit button while the request is in flight. A STATE, never an imperative — it must read differently from contact.formSend.",
  "contact.formSend": "The submit button's resting label. This one IS an imperative.",
  "events.dateTba": "A short badge on an event card whose date is not set yet. Keep it badge-length.",
  "toc.upcoming": "A table-of-contents section label, not a time adverb.",
  "toc.recent": "A table-of-contents section label for recent events.",
  "nav.members": "Nav label for the page listing club members AND the board. It is not the name of the governing body.",
  "footer.connect": "Footer column heading for social links. Must read differently from nav.contact.",
};

const report = [];
let changedFiles = 0;

for (const code of targets) {
  const existing = flatten(readDict(code));

  const items = Object.entries(enFlat)
    .filter(([, value]) => typeof value === "string")
    // Without --force, only fill genuine gaps: a hand-corrected translation
    // should survive a re-run.
    .filter(([key]) => force || typeof existing[key] !== "string" || existing[key].trim() === "")
    .map(([key, source]) => ({ key, source, note: NOTES[key] }));

  if (items.length === 0) {
    console.log(`${code}: already complete (${Object.keys(enFlat).length} keys)`);
    continue;
  }

  if (dryRun) {
    console.log(`[dry run] ${code}: would translate ${items.length} of ${Object.keys(enFlat).length} keys`);
    continue;
  }

  console.log(`${code}: translating ${items.length} key(s) as ${LANGUAGES[code].variety}…`);
  const { values, usage } = await translateSetComplete({ items, code, apiKey, groups });
  console.log(`  received ${Object.keys(values).length} ${formatUsage(usage)}`);

  const merged = { ...existing, ...values };

  // THE GATE. Checked before anything is written, so a failed run leaves the
  // dictionaries untouched rather than half-updated.
  const findings = checkDictionary(enFlat, merged, code);
  const errors = errorsOf(findings);
  console.log(formatFindings(findings, `${code} validation`));
  if (errors.length) {
    console.error(
      `\n${code}: ${errors.length} error(s) — nothing was written. ` +
        `Fix the glossary or re-run; the dictionaries are unchanged.`,
    );
    process.exitCode = 1;
    continue;
  }

  // Diff for the review report, before the write.
  for (const [key, value] of Object.entries(values)) {
    const before = existing[key];
    if (before !== value) report.push({ code, key, before, after: value });
  }

  writeFileSync(pathFor(code), JSON.stringify(unflatten(merged, enFlat), null, 2) + "\n", "utf8");
  changedFiles++;
  console.log(`  wrote src/i18n/${code}.json`);
}

// --- review report -----------------------------------------------------------
// The gate asserts mechanical properties; it cannot tell whether a sentence
// reads naturally. This is how a human sees what changed without reading a JSON
// diff — which is how "sustav prijateljskog parenja" went unnoticed.

if (report.length) {
  const lines = ["", "## Translation review", ""];
  for (const code of targets) {
    const rows = report.filter((r) => r.code === code);
    if (!rows.length) continue;
    lines.push(`### ${code} — ${rows.length} string(s) changed`, "");
    lines.push("| key | before | after |", "|---|---|---|");
    for (const r of rows) {
      const cell = (v) => String(v ?? "—").replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 160);
      lines.push(`| \`${r.key}\` | ${cell(r.before)} | ${cell(r.after)} |`);
    }
    lines.push("");
  }
  const markdown = lines.join("\n");
  console.log(markdown);

  // In CI this lands on the workflow run's summary page.
  if (process.env.GITHUB_STEP_SUMMARY) {
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, markdown, { flag: "a" });
  }
}

console.log(
  `\n${dryRun ? "[dry run] " : ""}${changedFiles} file(s) written, ${report.length} string(s) changed.` +
    (report.length ? "\nRead the table above before committing — the gate checks structure, not fluency." : ""),
);
