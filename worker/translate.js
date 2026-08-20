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

import {
  DICTS,
  TRANSLATABLE,
  gate,
  mergeTranslations,
  planFor,
  translationState,
} from "../src/lib/translate/content.js";
import {
  detectSourceLang,
  formatUsage,
  translateSetComplete,
  usage,
} from "../src/lib/translate/deepl.js";
import { formatFindings } from "../src/lib/translate/validate.js";

// --- the DeepL key ------------------------------------------------------------
//
// TWO PLACES, ON PURPOSE, and the order matters.
//
// A Worker secret (DEEPL_API_KEY) is the floor: a maintainer sets it once with
// `wrangler secret put` and translation works. But rotating it needs the
// Cloudflare dashboard or a laptop with wrangler on it, and the people running
// this club change every year. When the key eventually dies — the DeepL account
// was on a graduated president's address, someone regenerated it — a board with
// neither access nor a developer to call would be stuck with translation off
// and no way to turn it back on.
//
// So a value in KV overrides the secret, and /admin can write that value. The
// board pastes a new free key and translation resumes, with no deploy, no
// GitHub, and nobody to phone. The secret stays underneath as the fallback, so
// clearing the KV value returns the deployment to whatever the maintainer set.
//
// The key is never sent to the browser. The panel gets "set or not", which
// account it belongs to (last four characters, the ":fx" free-tier marker
// stripped so the digits identify something), who set it, and this month's
// usage — enough to tell "no key" from "a key DeepL rejects", which are
// different problems with different fixes.

const KEY_NAME = "deepl.apiKey";

/** Last four meaningful characters — ":fx" identifies the tier, not the key. */
export const fingerprint = (key) => String(key).replace(/:fx$/, "").slice(-4);

async function readStored(env) {
  // The binding is absent until a maintainer creates the namespace (see
  // worker/README.md). Absent is not broken: the secret still answers, and the
  // panel says the board cannot replace the key here yet.
  if (!env.SETTINGS) return null;
  try {
    return await env.SETTINGS.get(KEY_NAME, { type: "json", cacheTtl: 60 });
  } catch (error) {
    console.error("[translate] settings store unreadable:", error);
    return null;
  }
}

/**
 * The key this deployment should translate with, or null.
 *
 * @returns {Promise<{key: string, source: "kv"|"secret", setAt?: string, setBy?: string} | null>}
 */
export async function resolveKey(env) {
  const stored = await readStored(env);
  if (stored?.key) {
    return { key: stored.key, source: "kv", setAt: stored.setAt, setBy: stored.setBy };
  }
  if (env.DEEPL_API_KEY) return { key: env.DEEPL_API_KEY, source: "secret" };
  return null;
}

/**
 * What the panel is allowed to know about the key, plus whether DeepL still
 * accepts it.
 *
 * The usage call costs no quota, so this is a free liveness check — and it is
 * the difference between "no key" and "a key that no longer works", which read
 * identically to a board member otherwise.
 */
export async function keyStatus(env, { fetchImpl, signal } = {}) {
  const resolved = await resolveKey(env);
  if (!resolved) return { configured: false, editable: Boolean(env.SETTINGS) };

  const base = {
    configured: true,
    editable: Boolean(env.SETTINGS),
    source: resolved.source,
    last4: fingerprint(resolved.key),
    free: resolved.key.endsWith(":fx"),
    setAt: resolved.setAt ?? null,
    setBy: resolved.setBy ?? null,
  };

  try {
    const { count, limit } = await usage({ apiKey: resolved.key, fetchImpl, signal });
    return { ...base, live: true, usage: { count, limit, percent: limit ? (count / limit) * 100 : null } };
  } catch (error) {
    return { ...base, live: false, error: describeDeeplError(error) };
  }
}

/**
 * Store a key the board pasted — but only after DeepL accepts it.
 *
 * VERIFY BEFORE STORING, because KV wins over the secret: storing a mistyped
 * key would silently shadow a working one and turn translation off, which is
 * the opposite of what the person pressing the button was trying to do.
 */
export async function putKey(env, key, actor, { fetchImpl } = {}) {
  const candidate = String(key ?? "").trim();
  if (!env.SETTINGS) {
    throw Object.assign(new Error("no settings store"), { userMessage: NO_SETTINGS_STORE });
  }
  if (candidate.length < 20 || /\s/.test(candidate)) {
    throw Object.assign(new Error("malformed key"), {
      userMessage: "That doesn't look like a DeepL key — paste the whole thing, with no spaces.",
    });
  }

  // Deliberately loose beyond that: DeepL's key format is not documented as a
  // guarantee, and this call is the real check. A regex here could only reject
  // keys that work.
  const { count, limit } = await usage({ apiKey: candidate, fetchImpl });

  const value = { key: candidate, setAt: new Date().toISOString(), setBy: actor ?? null };
  await env.SETTINGS.put(KEY_NAME, JSON.stringify(value));

  // The only per-person record of this change. Cloudflare's own logs name the
  // Worker, never the board member — same reasoning as the access list.
  console.log(`[admin] DeepL key set by ${actor ?? "unknown"} (…${fingerprint(candidate)})`);

  return { last4: fingerprint(candidate), usage: { count, limit } };
}

/** Drop the board's key and fall back to whatever the maintainer set. */
export async function clearKey(env, actor) {
  if (!env.SETTINGS) {
    throw Object.assign(new Error("no settings store"), { userMessage: NO_SETTINGS_STORE });
  }
  await env.SETTINGS.delete(KEY_NAME);
  console.log(`[admin] DeepL key cleared by ${actor ?? "unknown"} — falling back to the Worker secret`);
}

export const NO_DEEPL_KEY =
  "Translations are off in this deployment because there is no DeepL key. Anyone on the " +
  "board can paste one under the Translations tab — a free key from deepl.com/pro-api " +
  "covers this club many times over — or a maintainer can run: wrangler secret put DEEPL_API_KEY";

const NO_SETTINGS_STORE =
  "This deployment has nowhere to keep a key yet, so it can only be set by a maintainer, " +
  "with: wrangler secret put DEEPL_API_KEY. To make it settable here instead, see the " +
  "ADMIN_SETTINGS section of worker/README.md.";

/** A DeepL failure, in a sentence a board member can act on. */
export function describeDeeplError(error) {
  if (error?.userMessage) return error.userMessage;
  if (error?.name === "AbortError") return "DeepL took too long to answer.";
  if (error?.status === 403 || error?.status === 401) {
    return "DeepL rejected that key. Check it was copied whole, and that the account is still active.";
  }
  if (error?.status === 429) return "DeepL is rate-limiting us. Wait a minute and try again.";
  if (error?.status === 456) return "This month's DeepL allowance is used up. It resets at the start of next month.";
  if (error?.status >= 500) return "DeepL is having trouble at the moment. Try again shortly.";
  return `DeepL didn't answer as expected: ${String(error?.message ?? error)}`;
}


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

// --- translating one entry ----------------------------------------------------
//
// NEVER THROWS. Every failure comes back as a status, because the caller is a
// board member's save and translation is not allowed to fail one: an event that
// saves untranslated is a smaller problem than an event that would not save.
// The outer catch in worker/index.js turns a throw into a 502 and abandons the
// commit, which is exactly the wrong answer here.
//
// Three nets catch what one attempt misses: this, the Translate button, and the
// nightly sweep. So "give up quietly and say so" is a complete strategy rather
// than a shrug.

/** How long the whole translation phase may take before it is abandoned. */
export const SAVE_BUDGET_MS = 8000;

const skip = (reason, message) => ({ status: "skipped", reason, message, i18n: undefined });
const fail = (reason, message) => ({ status: "failed", reason, message, i18n: undefined });

/**
 * Fill in an entry's translations, and merge them with what is already there.
 *
 * @param {object} options
 * @param {Record<string, any>} options.entry     the entry as it will be committed
 * @param {Record<string, any>|null} [options.existing]  its `i18n` block on file
 * @param {Record<string, any>} [options.submitted]      hand edits from the panel
 * @param {boolean} [options.force]               re-translate even if current
 * @returns {Promise<{status: string, reason?: string, message: string, i18n?: object, changed?: object[], usage?: object}>}
 */
export async function translateEntry({
  entry,
  existing = null,
  submitted = {},
  env,
  force = false,
  fields = TRANSLATABLE.events,
  label = "entry",
  budgetMs = SAVE_BUDGET_MS,
  fetchImpl,
  log = console,
}) {
  const plan = await planFor(entry, { fields, force });

  // A hand edit on its own is not a translation job: the board typed a better
  // Croatian title for text that has not changed, so there is nothing to ask
  // DeepL and nothing to spend. Merge it and go.
  if (plan.targets.length === 0 || plan.state === "none") {
    const merged = mergeTranslations({ existing, submitted, hash: plan.hash, fields });
    return {
      ...skip(plan.state === "none" ? "no-text" : "up-to-date", "Translations are already up to date."),
      i18n: merged,
    };
  }

  const resolved = await resolveKey(env);
  if (!resolved) return { ...skip("no-key", NO_DEEPL_KEY), i18n: mergeTranslations({ existing, submitted, hash: plan.hash, fields }) };

  const controller = new AbortController();
  const alarm = setTimeout(() => controller.abort(), budgetMs);

  try {
    const shared = { apiKey: resolved.key, fetchImpl, signal: controller.signal };

    // One call, and it pays for itself: the board writes in whatever language
    // suits them, and translating Croatian text while asserting it is English
    // produces fluent nonsense. null means "let DeepL decide per request".
    const detected = await detectSourceLang(
      plan.nonEmpty.map((field) => String(entry[field])),
      { ...shared, allowed: DICTS },
    );

    // Every target dictionary at once. Each is internally sequential over its
    // fields, so this holds concurrency at one request per language — four —
    // rather than eight, and finishes in about two round trips.
    const wanted = plan.targets.filter((dict) => dict !== detected);
    const results = await Promise.all(
      wanted.map(async (dict) => {
        const items = plan.nonEmpty.map((field) => ({
          key: field,
          source: String(entry[field]),
          // DeepL's context is not translated and not billed. Giving each field
          // the other one means a title and its description come back as the
          // same event rather than two unrelated strings.
          note: plan.nonEmpty
            .filter((other) => other !== field)
            .map((other) => `The event's ${other}: ${JSON.stringify(String(entry[other]))}`)
            .join(" "),
        }));

        const { values, usage: used } = await translateSetComplete({
          ...shared,
          items,
          code: dict,
          sourceLang: detected,
          onNote: (message) => log.warn?.(`[translate] ${label}: ${message}`),
        });
        return { dict, values, used };
      }),
    );

    const machine = {};
    let charsIn = 0;
    let charsOut = 0;
    for (const { dict, values, used } of results) {
      machine[dict] = values;
      charsIn += used.charsIn;
      charsOut += used.charsOut;
    }

    // THE GATE, unchanged from the CLI and all-or-nothing per entry. A
    // half-translated event is worse than an untranslated one, and the board
    // cannot read the Serbian to notice.
    const { findings, errors } = gate({ entry, i18n: machine, fields, label });
    if (errors.length) {
      log.error?.(formatFindings(findings, label));
      return fail(
        "validation",
        "Saved, but the translations came back wrong and were not used. A maintainer can see why in the logs.",
      );
    }

    const i18n = mergeTranslations({
      existing,
      machine,
      submitted,
      hash: plan.hash,
      sourceLang: detected ?? "en",
      fields,
    });

    log.log?.(
      `[translate] ${label}: source=${detected ?? "unknown"}, filled ${wanted.join(",")} ` +
        formatUsage({ charsIn, charsOut }),
    );

    return {
      status: "translated",
      message:
        plan.state === "stale"
          ? "The text changed, so the translations were filled in again."
          : "Translated into German, Croatian, Bosnian and Serbian.",
      i18n,
      usage: { charsIn, charsOut },
      sourceLang: detected ?? "en",
      filled: wanted,
    };
  } catch (error) {
    log.error?.(`[translate] ${label}: ${error?.message ?? error}`);
    const timedOut = error?.name === "AbortError";
    return fail(
      timedOut ? "timeout" : error?.status === 429 ? "quota" : "upstream",
      timedOut
        ? "Saved, but DeepL was too slow just now, so the translations are not filled in yet."
        : `Saved, but the translations could not be filled in: ${describeDeeplError(error)}`,
    );
  } finally {
    clearTimeout(alarm);
  }
}
