// What needs translating, what a translation is allowed to overwrite, and what
// the resulting `i18n` block looks like.
//
// This is the half of the pipeline that has no opinion about DeepL. It exists
// because two callers must agree on it exactly:
//
//   scripts/translate-content.mjs  — a maintainer running the CLI
//   worker/translate.js           — the board pressing Save in /admin
//
// If they disagree, the visible symptom is not an error. It is the panel
// re-translating an entry the CLI thinks is current, or a hand-corrected
// Bosnian title quietly reverting on the next save. So the rules live here,
// once, and both callers ask rather than decide.
//
// Isomorphic, like everything in this directory: no node: imports, no fs, no
// process. `crypto.subtle` is Web Crypto, present in both Node and workerd.

import { LANGUAGES } from "./glossary.js";
import { checkString, errorsOf } from "./validate.js";

/**
 * Which collections carry translations, and which of their fields.
 *
 * Only events, and only these two fields. An event's `location` is a venue
 * name or a street address and translating it corrupts directions; members and
 * partners are never translated at all (their schemas are `.strict()` with no
 * `i18n`, so a mistake here fails the build). See CLAUDE.md.
 */
export const TRANSLATABLE = { events: ["title", "description"] };

/** Dictionaries this site can actually produce — one per LANGUAGES entry. */
export const TARGETS = Object.keys(LANGUAGES);

/**
 * Every dictionary a source language could be, including English.
 *
 * `en` is a possible SOURCE but never a target: it has no LANGUAGES profile,
 * so nothing can fill it. That asymmetry is the whole reason completeness is
 * measured against TARGETS below — see translationState.
 */
export const DICTS = ["en", ...TARGETS];

const text = (value) => String(value ?? "");
const blank = (value) => text(value).trim() === "";

const encoder = new TextEncoder();

/**
 * Fingerprint of the source text, so an edit invalidates stale translations.
 *
 * Must stay byte-identical to the Node `createHash("sha256")` version that
 * wrote every hash currently in content/: each field is digested in order,
 * hex, first 16 characters. Fields are encoded separately and concatenated
 * rather than joined first — that is what `hash.update(f)` per field means,
 * and the two differ if a field ever ends mid-surrogate. content.test.js
 * asserts the equality against node:crypto and against the committed files.
 *
 * @param {Record<string, unknown>} entry
 * @param {string[]} [fields]
 * @returns {Promise<string>}
 */
export async function sourceHash(entry, fields = TRANSLATABLE.events) {
  const parts = fields.map((field) => encoder.encode(text(entry?.[field])));
  const bytes = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let at = 0;
  for (const part of parts) {
    bytes.set(part, at);
    at += part.length;
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

/** Is one dictionary's block complete for the fields that actually have text? */
const filled = (block, entry, fields) =>
  Boolean(block) && fields.every((field) => blank(entry?.[field]) || !blank(block[field]));

/**
 * Where one entry stands.
 *
 * - `none`       nothing to translate (no source text at all)
 * - `missing`    no i18n block yet
 * - `stale`      the English text changed since the block was written
 * - `partial`    some target dictionary is missing or half-filled
 * - `translated` current and complete
 *
 * NOTE the completeness test runs over TARGETS, not DICTS. It used to run over
 * DICTS, which includes `en`, while the fill loop skipped `en` for having no
 * LANGUAGES profile — so an entry authored in anything but English was never
 * complete and re-translated on every single run, overwriting hand
 * corrections each time. Latent until now (all nine committed events are
 * sourceLang "en") and harmless at a maintainer's yearly CLI run; a nightly
 * sweep would have made it a nightly rewrite. A dictionary nothing can fill
 * cannot be counted as missing.
 *
 * @returns {Promise<{state: string, hash: string, sourceLang: string|null, missing: string[]}>}
 */
export async function translationState(entry, fields = TRANSLATABLE.events) {
  const hash = await sourceHash(entry, fields);
  const sourceLang = entry?.i18n?.sourceLang ?? null;

  if (fields.every((field) => blank(entry?.[field]))) {
    return { state: "none", hash, sourceLang, missing: [] };
  }

  const existing = entry?.i18n ?? null;
  const targets = TARGETS.filter((dict) => dict !== sourceLang);

  if (!existing) return { state: "missing", hash, sourceLang: null, missing: [...TARGETS] };
  if (existing.sourceHash !== hash) return { state: "stale", hash, sourceLang, missing: targets };

  const missing = targets.filter((dict) => !filled(existing[dict], entry, fields));
  return { state: missing.length ? "partial" : "translated", hash, sourceLang, missing };
}

/**
 * What to send to DeepL for one entry: `targets` is empty when there is
 * nothing to do, which is the quota guard both callers rely on.
 *
 * A stale entry re-translates every target rather than just the missing ones —
 * the text they were translations OF no longer exists. `force` says the same
 * thing by hand, and is what /admin's "Translate now" button sends.
 *
 * @returns {Promise<{state: string, hash: string, nonEmpty: string[], targets: string[]}>}
 */
export async function planFor(entry, { fields = TRANSLATABLE.events, force = false } = {}) {
  const { state, hash, sourceLang, missing } = await translationState(entry, fields);
  const nonEmpty = fields.filter((field) => !blank(entry?.[field]));

  if (state === "none") return { state, hash, nonEmpty, targets: [] };
  if (force || state === "stale" || state === "missing") {
    return { state, hash, nonEmpty, targets: TARGETS.filter((dict) => dict !== sourceLang) };
  }
  return { state, hash, nonEmpty, targets: missing };
}

/**
 * The `i18n` block to commit.
 *
 * Three inputs, and which one wins is the whole point:
 *
 *   existing   what is on file
 *   machine    what DeepL just produced (already post-processed and gated)
 *   submitted  what a board member typed into /admin's Translations page
 *
 * When the English text has NOT changed, a hand edit wins over everything —
 * that is what makes the panel's translation fields worth having, and it
 * matches what the CLI already promised by not re-translating a current entry.
 *
 * When the English text HAS changed, the old translations and any submitted
 * edits are both dropped: they render text that no longer exists. The board is
 * told this in the save banner rather than left to notice it.
 *
 * Returns undefined when there is nothing to write, so a brand-new event with
 * no translations is committed without an empty `i18n` line.
 *
 * @param {object} options
 * @param {Record<string, any>|null} [options.existing]
 * @param {Record<string, Record<string,string>>} [options.machine]
 * @param {Record<string, Record<string,string>>} [options.submitted]
 * @param {string} options.hash        the CURRENT source hash
 * @param {string} [options.sourceLang]
 * @param {string[]} [options.fields]
 */
export function mergeTranslations({
  existing = null,
  machine = {},
  submitted = {},
  hash,
  sourceLang,
  fields = TRANSLATABLE.events,
}) {
  const current = Boolean(existing) && existing.sourceHash === hash;
  const blocks = {};

  const put = (dict, values) => {
    if (!TARGETS.includes(dict) || !values) return;
    for (const field of fields) {
      if (blank(values[field])) continue;
      blocks[dict] = { ...blocks[dict] };
      blocks[dict][field] = text(values[field]).trim();
    }
  };

  if (current) for (const dict of TARGETS) put(dict, existing[dict]);
  for (const dict of TARGETS) put(dict, machine[dict]);
  if (current) for (const dict of TARGETS) put(dict, submitted[dict]);

  if (Object.keys(blocks).length === 0) return undefined;

  return {
    // sourceLang is bookkeeping, not authority: DeepL's detection is easy to
    // get plausibly wrong between bs/hr/sr. Keep what is on file when it still
    // applies rather than churning it on every save.
    sourceLang: (current ? existing.sourceLang : null) ?? sourceLang ?? "en",
    sourceHash: hash,
    ...blocks,
  };
}

/**
 * Run the write gate over a finished `i18n` block.
 *
 * The same `checkString` the CLI has always used, over every dictionary and
 * field the block carries. Callers decide what to do with the result, because
 * they differ on purpose: the CLI drops the whole entry, /admin drops the
 * machine's output but tells the board about their own typing field by field.
 *
 * @returns {{findings: any[], errors: any[]}}
 */
export function gate({ entry, i18n, fields = TRANSLATABLE.events, label = "entry" }) {
  const findings = [];
  if (!i18n) return { findings, errors: [] };

  for (const dict of TARGETS) {
    const block = i18n[dict];
    if (!block) continue;
    for (const field of fields) {
      if (blank(block[field])) continue;
      findings.push(...checkString(text(entry?.[field]), text(block[field]), `${label}:${dict}.${field}`, dict));
    }
  }
  return { findings, errors: errorsOf(findings) };
}
