// Translation, from the panel's side.
//
// The rules themselves are not here. What needs translating, what a hand
// correction is allowed to survive, and what the committed `i18n` block looks
// like all live in src/lib/translate/content.js, shared with the CLI a
// maintainer runs — see the comment at the top of that file for why a second
// copy would be worse than useless.
//
// What IS here is everything that only makes sense inside the Worker: turning
// an entry into something the panel can draw a badge from, and (from the next
// stage on) resolving a DeepL key and calling the thing.

import { TRANSLATABLE, translationState } from "../src/lib/translate/content.js";

/** The translatable fields of a collection, or null if it has none. */
export const translatableFields = (collection) => TRANSLATABLE[collection] ?? null;

/**
 * Annotate a collection's entries with where each one's translations stand.
 *
 * Derived on every read rather than stored: the state is a function of the
 * text and the block beside it, so a stored copy would be one more thing that
 * can be wrong. Collections with nothing to translate come back untouched, so
 * the panel draws no badge for board members or partners.
 *
 * Must be applied everywhere the panel receives entries — getState, save AND
 * delete. collectionAfter() rebuilds its array from the entries read BEFORE
 * the change, so annotating in only one place leaves the board looking at a
 * badge from before their own edit.
 *
 * @param {string} collection
 * @param {{file: string, data: object}[]} entries
 */
export async function withTranslationState(collection, entries) {
  const fields = translatableFields(collection);
  if (!fields) return entries;

  return Promise.all(
    entries.map(async (entry) => ({
      ...entry,
      translation: await stateOf(entry.data, fields),
    })),
  );
}

/** One entry's translation state, in the shape the panel consumes. */
export async function stateOf(data, fields = TRANSLATABLE.events) {
  const { state, missing, sourceLang } = await translationState(data, fields);
  return { state, missing, sourceLang };
}
