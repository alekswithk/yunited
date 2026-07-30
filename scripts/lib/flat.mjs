// Flat <-> nested conversion for the i18n dictionaries.
//
// The dictionaries are nested JSON ({ nav: { events: "Events" } }) because that
// is what reads well in a file a human edits. Everything that PROCESSES them —
// translation, validation, diffing — wants a flat map keyed by dotted path
// ("nav.events"), because that is the unit of work.
//
// Both scripts and the validator need this, so it lives in one place: a second
// copy of `flatten` that walks keys in a different order would produce diffs
// that look like a whole-file reshuffle instead of the lines that changed.

/** { nav: { events: "Events" } } -> { "nav.events": "Events" }, in key order. */
export function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

/**
 * { "nav.events": "Events" } -> { nav: { events: "Events" } }.
 *
 * `order` is the reference flat map (normally English) whose key order the
 * output follows, so a translated file's key order matches en.json rather than
 * whatever order the values happened to arrive in. This is what keeps a
 * re-translation showing up in `git diff` as changed values, not a reshuffle.
 */
export function unflatten(flat, order = flat) {
  const out = {};
  for (const key of Object.keys(order)) {
    if (!(key in flat)) continue;
    const parts = key.split(".");
    let node = out;
    for (const part of parts.slice(0, -1)) {
      node[part] ??= {};
      node = node[part];
    }
    node[parts.at(-1)] = flat[key];
  }
  return out;
}

/**
 * Group the …Pre / …Link / …Post keys that form one sentence split around a
 * hyperlink.
 *
 * Returns { "<base key>": { Pre, Link, Post } } for every base that has at
 * least a Pre and a Link. These have to be translated and checked as a unit:
 * both sets shipped broken in both locales precisely because each fragment was
 * translated as if it were a standalone string.
 */
export function splitSentenceGroups(flat) {
  const groups = {};
  for (const key of Object.keys(flat)) {
    const match = key.match(/^(.*)(Pre|Link|Post)$/);
    if (!match) continue;
    const [, base, part] = match;
    (groups[base] ??= {})[part] = key;
  }
  for (const [base, parts] of Object.entries(groups)) {
    if (!parts.Pre || !parts.Link) delete groups[base];
  }
  return groups;
}
