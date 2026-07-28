// The one place the board's content is loaded and validated. Every page imports
// events/members FROM HERE, never from the raw JSON files, so any build touches
// this module and the schema check runs before a single page is emitted.
//
// Content is one JSON file per entry (content/events/*.json,
// content/members/*.json) — the layout the CMS edits. A validation failure
// throws with a message naming the offending file and field, readable enough
// for a board member to fix without reading a stack trace.
import { eventSchema, memberSchema, partnerSchema } from "./schema.js";
import { splitEvents, hasDate } from "./events.js";

/**
 * Swap an entry's translatable fields for the given dictionary's versions.
 *
 * `dict` is a dictionary name (en/de/bcs/sr), not a locale code — callers get it
 * from getLocale(locale).dict, so bs and hr share bcs exactly as the UI strings do.
 *
 * Falls back field by field to the source text, so a partially translated entry
 * still renders completely rather than showing a blank title. Returns the entry
 * untouched when there is nothing to apply, which keeps the no-`i18n` case free.
 */
export function localizeEntry(entry, dict) {
  const translated = entry?.i18n?.[dict];
  if (!translated) return entry;

  const out = { ...entry };
  for (const [field, value] of Object.entries(translated)) {
    if (typeof value === "string" && value.trim() !== "") out[field] = value;
  }
  return out;
}

// Eagerly import every entry file at build time. Keys are project-root paths
// like "/content/events/casino-night-2026.json".
const eventModules = import.meta.glob("/content/events/*.json", { eager: true });
const memberModules = import.meta.glob("/content/members/*.json", { eager: true });
// Empty today. A glob over a directory with no files is simply an empty object,
// so this costs nothing until the board adds its first partner.
const partnerModules = import.meta.glob("/content/partners/*.json", { eager: true });

// Validate each file against `schema`, collecting every problem across the
// whole collection before throwing, so one build shows all the fixes needed.
function loadCollection(modules, schema, extraChecks = () => []) {
  const entries = [];
  const errors = [];

  for (const [path, mod] of Object.entries(modules).sort(([a], [b]) => a.localeCompare(b))) {
    const file = path.replace(/^\//, ""); // -> "content/events/x.json"
    const result = schema.safeParse(mod.default ?? mod);
    if (result.success) {
      entries.push({ file, data: result.data });
    } else {
      for (const issue of result.error.issues) {
        const where = issue.path.length ? `${file} → ${issue.path.join(".")}` : file;
        errors.push(`  • ${where} ${issue.message}`);
      }
    }
  }

  errors.push(...extraChecks(entries));

  if (errors.length) {
    throw new Error(
      `Content failed validation:\n${errors.join("\n")}\n` +
        `Fix the field(s) above and rebuild.`
    );
  }
  return entries.map((e) => e.data);
}

/**
 * The filename IS the id. That was always the rule; now it is also the source.
 *
 * The board no longer types a slug — the CMS derives the filename from the title
 * and does not write an `id` field at all, so entries created or re-saved through
 * `/admin` simply do not have one. Reading it off the filename makes those files
 * valid without a migration, and makes a mismatch structurally impossible for
 * anything the CMS produces.
 *
 * An entry that still carries an explicit `id` (every hand-authored file does)
 * must agree with its filename, because a rename that updated only one of the
 * two is a genuine mistake worth failing on.
 *
 * @type {import("./schema.js").Event[]}
 */
export const events = loadCollection(eventModules, eventSchema, (entries) => {
  const errors = [];
  for (const entry of entries) {
    const fromFilename = entry.file.replace(/^content\/events\//, "").replace(/\.json$/, "");
    if (entry.data.id && entry.data.id !== fromFilename) {
      errors.push(
        `  • ${entry.file} → id "${entry.data.id}" does not match its filename ` +
          `(expected content/events/${entry.data.id}.json, or drop the id and let the filename decide)`,
      );
    }
    // Filenames are unique by construction, so deriving the id from the filename
    // removes the possibility of a duplicate rather than checking for one.
    entry.data.id = entry.data.id ?? fromFilename;
  }
  return errors;
});

// An empty calendar is a WARNING, never an error.
//
// Because events are filed as past purely by date, the events page drains
// itself: the last party of the semester slips into "Past events" on its own and
// nothing announces that "Upcoming" is now empty. The build stays green, the
// deploy succeeds, and the site quietly advertises a club whose most recent
// event was months ago — which is exactly what happened between May and July
// 2026, unnoticed for about eleven weeks.
//
// Between semesters that state is entirely legitimate, so this must not fail the
// build; a static site that refuses to deploy in August would be worse than the
// problem. It just makes the situation visible in the build log — and to the
// board, in the Cloudflare deploy output.
{
  const { upcoming } = splitEvents(events);
  const dated = upcoming.filter(hasDate);
  if (dated.length === 0) {
    const tba = upcoming.length;
    console.warn(
      `\n⚠  No upcoming event has a date.` +
        (tba > 0
          ? ` The events page will show ${tba} TBA card${tba === 1 ? "" : "s"} and nothing else.`
          : ` The "Upcoming events" section will render its empty state.`) +
        `\n   Fine between semesters — add the next term's events in /admin when they are set.\n`,
    );
  }
}

// Both members and partners are ordered by a unique `order`, so the check is
// shared rather than written twice.
const uniqueOrder = (entries) => {
  const errors = [];
  const seen = new Map();
  for (const { file, data } of entries) {
    if (seen.has(data.order)) {
      errors.push(`  • ${file} → duplicate order ${data.order} (also in ${seen.get(data.order)})`);
    } else {
      seen.set(data.order, file);
    }
  }
  return errors;
};

/** @type {import("./schema.js").Member[]} */
export const members = loadCollection(memberModules, memberSchema, uniqueOrder)
  .sort((a, b) => a.order - b.order); // lowest order first; [0] is the lead

/**
 * Partner organisations, lowest `order` first. Empty until the board adds one —
 * `/partners` renders its pitch either way and simply omits the logo strip, so
 * an empty collection is a normal state, not a missing-content error.
 *
 * @type {import("./schema.js").Partner[]}
 */
export const partners = loadCollection(partnerModules, partnerSchema, uniqueOrder)
  .sort((a, b) => a.order - b.order);
