// What the panel is told about translations.
//
// The rules themselves are tested in src/lib/translate/content.test.js; these
// cases are about the Worker's side of the wire — the shape the browser
// receives, and the collections that must never grow a badge.

import { test } from "node:test";
import assert from "node:assert/strict";

import { sourceHash } from "../src/lib/translate/content.js";
import {
  clearKey,
  fingerprint,
  keyStatus,
  putKey,
  resolveKey,
  stateOf,
  translateEntry,
  translatableFields,
  withTranslationState,
} from "./translate.js";

/** A KV namespace, in memory. Only the four methods this code calls. */
function fakeKv(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    get: async (key, options) => {
      const raw = store.get(key);
      if (raw === undefined) return null;
      return options?.type === "json" ? JSON.parse(raw) : raw;
    },
    put: async (key, value) => void store.set(key, value),
    delete: async (key) => void store.delete(key),
  };
}

/** DeepL's /v2/usage, scripted. Records what it was asked. */
function fakeDeepl({ status = 200, body = { character_count: 25014, character_limit: 1000000 } } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), auth: init?.headers?.Authorization });
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: "",
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  };
  return { calls, fetchImpl };
}

const FREE_KEY = "12345678-90ab-cdef-1234-567890abcdef:fx";

const event = (over = {}) => ({
  title: "Karaoke Night",
  description: "Karaoke night at Déja Vu Bar.",
  ...over,
});

const complete = (hash) => ({
  sourceLang: "en",
  sourceHash: hash,
  de: { title: "Karaoke-Abend", description: "Karaoke-Abend in der Déja Vu Bar." },
  hr: { title: "Karaoke večer", description: "Karaoke večer u Déja Vu Baru." },
  bs: { title: "Karaoke večer", description: "Karaoke večer u Déja Vu Baru." },
  sr: { title: "Karaoke veče", description: "Karaoke veče u Déja Vu Baru." },
});

test("only events are translatable", () => {
  assert.deepEqual(translatableFields("events"), ["title", "description"]);
  assert.equal(translatableFields("members"), null);
  assert.equal(translatableFields("partners"), null);
});

test("events are annotated with their translation state", async () => {
  const data = event();
  const hash = await sourceHash(data);

  const entries = await withTranslationState("events", [
    { file: "translated.json", data: { ...data, i18n: complete(hash) } },
    { file: "stale.json", data: { ...data, i18n: complete("0000000000000000") } },
    { file: "new.json", data },
  ]);

  assert.deepEqual(
    entries.map((e) => e.translation.state),
    ["translated", "stale", "missing"],
  );
  assert.equal(entries[0].file, "translated.json", "file and data survive the annotation");
  assert.deepEqual(entries[0].data, { ...data, i18n: complete(hash) });
});

// Board members and partners have no i18n block at all and never will — their
// schemas are .strict(). A badge on those rows would be the panel promising
// something the content model forbids.
test("members and partners come back exactly as they went in", async () => {
  const members = [{ file: "president.json", data: { name: "Ana", role: "President" } }];
  const annotated = await withTranslationState("members", members);

  assert.equal(annotated, members);
  assert.ok(!("translation" in annotated[0]));
});

test("an entry with no text to translate reports none, not missing", async () => {
  const [entry] = await withTranslationState("events", [
    { file: "blank.json", data: { title: "", description: "" } },
  ]);
  assert.equal(entry.translation.state, "none");
});

test("stateOf reports the missing dictionaries by name", async () => {
  const data = event();
  const i18n = complete(await sourceHash(data));
  delete i18n.sr;
  delete i18n.bs;

  const state = await stateOf({ ...data, i18n });
  assert.equal(state.state, "partial");
  assert.deepEqual(state.missing, ["bs", "sr"]);
  assert.equal(state.sourceLang, "en");
});

// --- the key -----------------------------------------------------------------

test("KV wins over the secret, and the secret is the fallback", async () => {
  const stored = JSON.stringify({ key: "kv-key-0000000000000000", setAt: "2026-08-20", setBy: "ana@hsg.ch" });

  assert.equal((await resolveKey({ ADMIN_SETTINGS: fakeKv({ "deepl.apiKey": stored }), DEEPL_API_KEY: "secret-key-000000000" })).source, "kv");
  assert.equal((await resolveKey({ ADMIN_SETTINGS: fakeKv(), DEEPL_API_KEY: "secret-key-000000000" })).source, "secret");
  assert.equal(await resolveKey({ ADMIN_SETTINGS: fakeKv() }), null);

  // No namespace bound yet — the secret must still answer, or a deployment
  // that has not had the store created loses translation entirely.
  assert.equal((await resolveKey({ DEEPL_API_KEY: "secret-key-000000000" })).source, "secret");
  assert.equal(await resolveKey({}), null);
});

test("the key never leaves the Worker", async () => {
  const { fetchImpl } = fakeDeepl();
  const status = await keyStatus({ ADMIN_SETTINGS: fakeKv(), DEEPL_API_KEY: FREE_KEY }, { fetchImpl });

  const serialized = JSON.stringify(status);
  assert.ok(!serialized.includes(FREE_KEY), "the whole key must never be serialized");
  assert.ok(!serialized.includes("567890abcdef"), "nor any usable part of it");
  assert.equal(status.last4, "cdef");
  assert.equal(status.free, true);
});

test("fingerprint identifies the key, not the tier", () => {
  // Naively taking the last four characters of a free key gives ":fx" plus one
  // character — the same for every free key on earth, which identifies nothing.
  assert.equal(fingerprint(FREE_KEY), "cdef");
  assert.equal(fingerprint("12345678-90ab-cdef-1234-567890abcdef"), "cdef");
});

test("a key DeepL rejects reads differently from no key at all", async () => {
  const { fetchImpl } = fakeDeepl({ status: 403, body: {} });
  const rejected = await keyStatus({ ADMIN_SETTINGS: fakeKv(), DEEPL_API_KEY: FREE_KEY }, { fetchImpl });

  assert.equal(rejected.configured, true);
  assert.equal(rejected.live, false);
  assert.match(rejected.error, /rejected that key/);

  const none = await keyStatus({ ADMIN_SETTINGS: fakeKv() });
  assert.equal(none.configured, false);
  assert.equal(none.live, undefined);
});

test("usage comes back as counted characters, not tokens", async () => {
  const { fetchImpl, calls } = fakeDeepl();
  const status = await keyStatus({ ADMIN_SETTINGS: fakeKv(), DEEPL_API_KEY: FREE_KEY }, { fetchImpl });

  assert.equal(status.usage.count, 25014);
  assert.equal(status.usage.limit, 1000000);
  assert.ok(Math.abs(status.usage.percent - 2.5014) < 1e-9, "percent is derived, not rounded here");
  assert.match(calls[0].url, /^https:\/\/api-free\.deepl\.com\/v2\/usage$/, "a :fx key must use the free host");
  assert.equal(calls[0].auth, `DeepL-Auth-Key ${FREE_KEY}`);
});

// The important one. KV overrides the secret, so storing a key that does not
// work would silently switch translation OFF — the exact opposite of what the
// person pressing Save was trying to do.
test("a key DeepL refuses is never stored", async () => {
  const kv = fakeKv();
  const { fetchImpl } = fakeDeepl({ status: 403, body: {} });

  await assert.rejects(
    () => putKey({ ADMIN_SETTINGS: kv }, "12345678-90ab-cdef-1234-567890abcdef:fx", "ana@hsg.ch", { fetchImpl }),
    (error) => error.status === 403,
  );
  assert.equal(kv.store.size, 0, "nothing was written");
});

test("a working key is stored with who set it and when", async () => {
  const kv = fakeKv();
  const { fetchImpl } = fakeDeepl();

  const result = await putKey({ ADMIN_SETTINGS: kv }, FREE_KEY, "ana@hsg.ch", { fetchImpl });
  assert.equal(result.last4, "cdef");

  const stored = JSON.parse(kv.store.get("deepl.apiKey"));
  assert.equal(stored.key, FREE_KEY);
  assert.equal(stored.setBy, "ana@hsg.ch");
  assert.ok(Date.parse(stored.setAt), "setAt is a real timestamp");

  await clearKey({ ADMIN_SETTINGS: kv }, "ana@hsg.ch");
  assert.equal(kv.store.size, 0);
});

test("obvious nonsense is refused without spending a request", async () => {
  const kv = fakeKv();
  const { fetchImpl, calls } = fakeDeepl();

  for (const bad of ["", "   ", "too-short", "has spaces in the middle of it here"]) {
    await assert.rejects(() => putKey({ ADMIN_SETTINGS: kv }, bad, "ana@hsg.ch", { fetchImpl }));
  }
  assert.equal(calls.length, 0);
  assert.equal(kv.store.size, 0);
});

test("with no settings store, the key can only come from the secret", async () => {
  await assert.rejects(
    () => putKey({}, FREE_KEY, "ana@hsg.ch"),
    (error) => /wrangler secret put DEEPL_API_KEY/.test(error.userMessage),
  );

  const status = await keyStatus({ DEEPL_API_KEY: FREE_KEY }, { fetchImpl: fakeDeepl().fetchImpl });
  assert.equal(status.editable, false, "the panel must not offer a box that cannot save");
});

// --- translating an entry -----------------------------------------------------

/**
 * DeepL's /v2/translate, scripted per target language.
 *
 * `translate` receives the source text and the target and returns the string to
 * answer with; anything it throws becomes an HTTP failure. Every request is
 * recorded, which is how the "spends no quota" cases are asserted — those are
 * about calls NOT made.
 */
function fakeTranslator({ translate = (text, lang) => `${lang}:${text}`, detected = "EN", status = 200, hang = false } = {}) {
  const calls = [];
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ target: body.target_lang, source: body.source_lang, context: body.context, text: body.text[0] });

    // Real fetch rejects at once on an already-aborted signal, and that matters
    // here: detectSourceLang swallows its own AbortError, so the calls after a
    // blown budget rely on exactly this to fail instead of hanging.
    if (init.signal?.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });

    if (hang) {
      // Never resolves on its own; only the abort signal ends it.
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        );
      });
    }
    if (status !== 200) {
      return { ok: false, status, statusText: "", text: async () => "{}", json: async () => ({}) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        translations: [{ text: translate(body.text[0], body.target_lang), detected_source_language: detected }],
      }),
    };
  };
  return { calls, fetchImpl };
}

const quiet = { log: () => {}, warn: () => {}, error: () => {} };
const KEYED = { DEEPL_API_KEY: FREE_KEY };

test("a new event comes back translated into all four languages", async () => {
  const { fetchImpl, calls } = fakeTranslator({
    translate: (text, lang) => `[${lang}] ${text}`,
  });

  const result = await translateEntry({ entry: event(), env: KEYED, fetchImpl, log: quiet, label: "karaoke.json" });

  assert.equal(result.status, "translated");
  assert.deepEqual(result.filled.sort(), ["bs", "de", "hr", "sr"]);
  assert.equal(result.i18n.hr.title, "[HR] Karaoke Night");
  assert.equal(result.i18n.sourceLang, "en");
  assert.equal(result.i18n.sourceHash, await sourceHash(event()));

  // One detection call plus one per language per field.
  assert.equal(calls.filter((c) => c.target === "EN").length, 1);
  assert.equal(calls.length, 1 + 4 * 2);

  // The sibling field travels as context — untranslated, unbilled, and the
  // reason a title and its description come back as the same event.
  const hrTitle = calls.find((c) => c.target === "HR" && c.text.includes("Karaoke Night"));
  assert.match(hrTitle.context, /The event's description/);
});

// The gate, all-or-nothing per entry. Serbian is published in Latin here and
// check:dist asserts it on the built pages, so Cyrillic coming back is a defect
// that must not reach the commit.
test("Cyrillic in the Serbian output throws the whole entry away, not just Serbian", async () => {
  const { fetchImpl } = fakeTranslator({
    translate: (text, lang) => (lang === "SR" ? "Караоке вече" : `[${lang}] ${text}`),
  });

  const result = await translateEntry({ entry: event(), env: KEYED, fetchImpl, log: quiet });

  assert.equal(result.status, "failed");
  assert.equal(result.reason, "validation");
  assert.equal(result.i18n, undefined, "a half-translated event is worse than an untranslated one");
  assert.match(result.message, /^Saved, but/, "the save still succeeded");
});

test("a slow DeepL is abandoned, not waited on", async () => {
  const { fetchImpl } = fakeTranslator({ hang: true });

  const started = Date.now();
  const result = await translateEntry({ entry: event(), env: KEYED, fetchImpl, log: quiet, budgetMs: 50 });

  assert.equal(result.status, "failed");
  assert.equal(result.reason, "timeout");
  assert.ok(Date.now() - started < 2000, "the abort actually fired");
  assert.equal(result.i18n, undefined);
});

test("being rate-limited says wait, not ask a maintainer", async () => {
  const { fetchImpl } = fakeTranslator({ status: 429 });
  const result = await translateEntry({ entry: event(), env: KEYED, fetchImpl, log: quiet });

  assert.equal(result.status, "failed");
  assert.equal(result.reason, "quota");
  assert.match(result.message, /Wait a minute/);
});

// The quota guard, and the thing a refactor breaks first.
test("an up-to-date entry spends nothing", async () => {
  const data = event();
  const entry = { ...data, i18n: complete(await sourceHash(data)) };
  const { fetchImpl, calls } = fakeTranslator();

  const result = await translateEntry({ entry, existing: entry.i18n, env: KEYED, fetchImpl, log: quiet });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "up-to-date");
  assert.equal(calls.length, 0);

  const forced = await translateEntry({ entry, existing: entry.i18n, env: KEYED, fetchImpl, log: quiet, force: true });
  assert.equal(forced.status, "translated");
  assert.ok(calls.length > 0);
});

test("a hand edit alone is merged without asking DeepL", async () => {
  const data = event();
  const existing = complete(await sourceHash(data));
  const { fetchImpl, calls } = fakeTranslator();

  const result = await translateEntry({
    entry: { ...data, i18n: existing },
    existing,
    submitted: { hr: { title: "Karaoke noć" } },
    env: KEYED,
    fetchImpl,
    log: quiet,
  });

  assert.equal(calls.length, 0, "correcting a translation is not a translation job");
  assert.equal(result.i18n.hr.title, "Karaoke noć");
  assert.equal(result.i18n.bs.title, existing.bs.title);
});

test("with no key an event still saves, and says why it is untranslated", async () => {
  const result = await translateEntry({ entry: event(), env: {}, log: quiet });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "no-key");
  assert.match(result.message, /Translations tab/);
});

test("the language the board wrote in is not translated back into itself", async () => {
  const { fetchImpl, calls } = fakeTranslator({ detected: "DE" });
  const german = { title: "Karaoke-Abend", description: "Karaoke-Abend in der Déja Vu Bar." };

  const result = await translateEntry({ entry: german, env: KEYED, fetchImpl, log: quiet });

  assert.equal(result.status, "translated");
  assert.equal(result.i18n.sourceLang, "de");
  assert.equal(result.i18n.de, undefined, "the authored text already serves German");
  assert.equal(calls.some((c) => c.target === "DE"), false);
});
