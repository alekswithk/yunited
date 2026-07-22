// The one place the board's content is loaded and validated. Every page imports
// events/members FROM HERE, never from the raw JSON files, so any build touches
// this module and the schema check runs before a single page is emitted.
//
// Content is one JSON file per entry (content/events/*.json,
// content/members/*.json) — the layout the CMS edits. A validation failure
// throws with a message naming the offending file and field, readable enough
// for a board member to fix without reading a stack trace.
import { eventSchema, memberSchema } from "./schema.js";

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

export const events = loadCollection(eventModules, eventSchema, (entries) => {
  const errors = [];
  const seen = new Map();
  for (const { file, data } of entries) {
    // The filename is the id, so a mismatch means the file was renamed without
    // updating its `id` (or vice versa) — both would confuse the CMS.
    const expected = `content/events/${data.id}.json`;
    if (file !== expected) {
      errors.push(`  • ${file} → id "${data.id}" does not match its filename (expected ${expected})`);
    }
    if (seen.has(data.id)) {
      errors.push(`  • ${file} → duplicate id "${data.id}" (also in ${seen.get(data.id)})`);
    } else {
      seen.set(data.id, file);
    }
  }
  return errors;
});

export const members = loadCollection(memberModules, memberSchema, (entries) => {
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
}).sort((a, b) => a.order - b.order); // lowest order first; [0] is the lead
