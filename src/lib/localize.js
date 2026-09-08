/**
 * Swap an entry's translatable fields for one locale's versions.
 *
 * Falls back field by field to the source text, so partial or blank machine
 * output can never erase content. Kept separate from content.js because that
 * module evaluates Astro's import.meta.glob at load time; this pure helper can
 * be tested directly under Node.
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
