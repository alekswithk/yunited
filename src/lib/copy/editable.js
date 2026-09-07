// Which UI dictionary keys the inline copy editor is allowed to change.
//
// A predicate over en.json, not a second copy of the key list — en.json stays
// the source of truth. Imported by three places that must agree exactly:
//
//   src/components/EditableCopy.astro  — decides whether to emit data-i18n-key
//   worker/index.js  (postCopy)        — rejects a write to a key outside this
//   scripts/check-dist.mjs             — fails the build on a data-i18n-key
//                                        that is not editable
//
// Isomorphic: plain JS, no imports, safe in Node, the build and workerd.
//
// Deliberately narrow. `nav.*` and `toc.*` are excluded by prefix and MUST stay
// excluded — `toc.buddy` drives the About-page rail width (CLAUDE.md's
// most-repeated warning) and the save path has no browser check. `meta.*` renders
// into <head>, never onto a visible element, so EditableCopy could not reach it
// anyway. HTML fragments and Pre/Link/Post split sentences are out of scope for
// now (a plain <textarea> cannot round-trip them safely).

export const ALLOW_PREFIXES = ["about.", "home."];
export const DENY_KEYS = new Set(["skipLink"]);

/**
 * @param {string} key    a dotted dictionary key ("about.missionP1")
 * @param {unknown} value  its English text, from en.json
 * @returns {boolean}
 */
export function isEditableCopyKey(key, value) {
  if (typeof key !== "string" || typeof value !== "string" || value.trim() === "") return false;
  if (DENY_KEYS.has(key)) return false;
  if (!ALLOW_PREFIXES.some((prefix) => key.startsWith(prefix))) return false;
  if (/<[a-z/]/i.test(value)) return false; // set:html fragment
  if (/(Pre|Link|Post)$/.test(key)) return false; // one third of a split sentence
  if (/\{\w+\}/.test(value)) return false; // an interpolation slot a <textarea> would drop
  return true;
}
