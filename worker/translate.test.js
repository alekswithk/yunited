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

  assert.equal((await resolveKey({ SETTINGS: fakeKv({ "deepl.apiKey": stored }), DEEPL_API_KEY: "secret-key-000000000" })).source, "kv");
  assert.equal((await resolveKey({ SETTINGS: fakeKv(), DEEPL_API_KEY: "secret-key-000000000" })).source, "secret");
  assert.equal(await resolveKey({ SETTINGS: fakeKv() }), null);

  // No namespace bound yet — the secret must still answer, or a deployment
  // that has not had the store created loses translation entirely.
  assert.equal((await resolveKey({ DEEPL_API_KEY: "secret-key-000000000" })).source, "secret");
  assert.equal(await resolveKey({}), null);
});

test("the key never leaves the Worker", async () => {
  const { fetchImpl } = fakeDeepl();
  const status = await keyStatus({ SETTINGS: fakeKv(), DEEPL_API_KEY: FREE_KEY }, { fetchImpl });

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
  const rejected = await keyStatus({ SETTINGS: fakeKv(), DEEPL_API_KEY: FREE_KEY }, { fetchImpl });

  assert.equal(rejected.configured, true);
  assert.equal(rejected.live, false);
  assert.match(rejected.error, /rejected that key/);

  const none = await keyStatus({ SETTINGS: fakeKv() });
  assert.equal(none.configured, false);
  assert.equal(none.live, undefined);
});

test("usage comes back as counted characters, not tokens", async () => {
  const { fetchImpl, calls } = fakeDeepl();
  const status = await keyStatus({ SETTINGS: fakeKv(), DEEPL_API_KEY: FREE_KEY }, { fetchImpl });

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
  const SETTINGS = fakeKv();
  const { fetchImpl } = fakeDeepl({ status: 403, body: {} });

  await assert.rejects(
    () => putKey({ SETTINGS }, "12345678-90ab-cdef-1234-567890abcdef:fx", "ana@hsg.ch", { fetchImpl }),
    (error) => error.status === 403,
  );
  assert.equal(SETTINGS.store.size, 0, "nothing was written");
});

test("a working key is stored with who set it and when", async () => {
  const SETTINGS = fakeKv();
  const { fetchImpl } = fakeDeepl();

  const result = await putKey({ SETTINGS }, FREE_KEY, "ana@hsg.ch", { fetchImpl });
  assert.equal(result.last4, "cdef");

  const stored = JSON.parse(SETTINGS.store.get("deepl.apiKey"));
  assert.equal(stored.key, FREE_KEY);
  assert.equal(stored.setBy, "ana@hsg.ch");
  assert.ok(Date.parse(stored.setAt), "setAt is a real timestamp");

  await clearKey({ SETTINGS }, "ana@hsg.ch");
  assert.equal(SETTINGS.store.size, 0);
});

test("obvious nonsense is refused without spending a request", async () => {
  const SETTINGS = fakeKv();
  const { fetchImpl, calls } = fakeDeepl();

  for (const bad of ["", "   ", "too-short", "has spaces in the middle of it here"]) {
    await assert.rejects(() => putKey({ SETTINGS }, bad, "ana@hsg.ch", { fetchImpl }));
  }
  assert.equal(calls.length, 0);
  assert.equal(SETTINGS.store.size, 0);
});

test("with no settings store, the key can only come from the secret", async () => {
  await assert.rejects(
    () => putKey({}, FREE_KEY, "ana@hsg.ch"),
    (error) => /wrangler secret put DEEPL_API_KEY/.test(error.userMessage),
  );

  const status = await keyStatus({ DEEPL_API_KEY: FREE_KEY }, { fetchImpl: fakeDeepl().fetchImpl });
  assert.equal(status.editable, false, "the panel must not offer a box that cannot save");
});
