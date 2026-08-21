// Tests for the shared decision core.
//
// Two of these are load-bearing in a way the others are not:
//
//   * the hash-parity test, because content/ is full of hashes written by
//     node:crypto and read from now on by Web Crypto inside a Worker;
//   * the golden test, because if the algorithm ever drifts, every committed
//     event silently becomes "stale" and the next sweep re-translates all of
//     them — over copy the board hand-corrected in #50.
//
// node: imports are fine HERE. This file runs only under `node --test`; the
// module it tests is the one that has to stay isomorphic.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { DICTS, TARGETS, gate, mergeTranslations, planFor, sourceHash, translationState } from "./content.js";

const EVENTS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "content", "events");
const FIELDS = ["title", "description"];

/** The implementation that wrote every hash in content/, kept here to test against. */
const nodeHash = (entry, fields = FIELDS) => {
  const h = createHash("sha256");
  for (const f of fields) h.update(String(entry[f] ?? ""), "utf8");
  return h.digest("hex").slice(0, 16);
};

const event = (over = {}) => ({
  title: "Karaoke Night",
  description: "Karaoke night at Déja Vu Bar.",
  ...over,
});

const full = (over = {}) => ({
  sourceLang: "en",
  de: { title: "Karaoke-Abend", description: "Karaoke-Abend in der Déja Vu Bar." },
  hr: { title: "Karaoke večer", description: "Karaoke večer u Déja Vu Baru." },
  bs: { title: "Karaoke večer", description: "Karaoke večer u Déja Vu Baru." },
  sr: { title: "Karaoke veče", description: "Karaoke veče u Déja Vu Baru." },
  ...over,
});

test("sourceHash matches the node:crypto version that wrote the committed hashes", async () => {
  for (const entry of [
    event(),
    event({ title: "Prvi Maj — šta, ćao, đevojka, žurka", description: "Ćevapi 🎤 i džez" }),
    event({ description: "" }),
    { title: "", description: "" },
  ]) {
    assert.equal(await sourceHash(entry, FIELDS), nodeHash(entry, FIELDS));
  }
});

test("every committed event's sourceHash still matches its text", async () => {
  const files = readdirSync(EVENTS).filter((f) => f.endsWith(".json"));
  assert.ok(files.length > 0, "no events found — is the path right?");

  for (const file of files) {
    const entry = JSON.parse(readFileSync(join(EVENTS, file), "utf8"));
    if (!entry.i18n) continue;
    assert.equal(
      entry.i18n.sourceHash,
      await sourceHash(entry, FIELDS),
      `${file}: hash no longer matches its source text. If this fails after a deliberate ` +
        `change to sourceHash, every committed event just became "stale" and the next sweep ` +
        `will re-translate all of them over the board's hand corrections.`,
    );
  }
});

test("translationState: current, stale, missing, partial, empty", async () => {
  const entry = event();
  const hash = await sourceHash(entry, FIELDS);

  assert.equal((await translationState({ ...entry, i18n: full({ sourceHash: hash }) })).state, "translated");
  assert.equal((await translationState({ ...entry, i18n: full({ sourceHash: "0000000000000000" }) })).state, "stale");
  assert.equal((await translationState(entry)).state, "missing");
  assert.equal((await translationState({ title: "", description: "" })).state, "none");

  const partial = full({ sourceHash: hash });
  delete partial.sr;
  const state = await translationState({ ...entry, i18n: partial });
  assert.equal(state.state, "partial");
  assert.deepEqual(state.missing, ["sr"]);
});

test("translationState: a blank field needs no translation, a blank translation does", async () => {
  const entry = event({ description: "" });
  const hash = await sourceHash(entry, FIELDS);

  const titlesOnly = { sourceLang: "en", sourceHash: hash };
  for (const dict of TARGETS) titlesOnly[dict] = { title: "…" };
  assert.equal((await translationState({ ...entry, i18n: titlesOnly })).state, "translated");

  const withText = event();
  const hash2 = await sourceHash(withText, FIELDS);
  const half = { sourceLang: "en", sourceHash: hash2 };
  for (const dict of TARGETS) half[dict] = { title: "…" };
  assert.equal((await translationState({ ...withText, i18n: half })).state, "partial");
});

// The regression this file exists for. `en` is in DICTS but has no LANGUAGES
// profile, so nothing can ever fill it; counting it as missing made every
// non-English entry permanently stale.
test("an entry authored in German is complete without an English block", async () => {
  const entry = event({ title: "Karaoke-Abend", description: "Karaoke-Abend in der Déja Vu Bar." });
  const i18n = { sourceLang: "de", sourceHash: await sourceHash(entry, FIELDS) };
  for (const dict of TARGETS) if (dict !== "de") i18n[dict] = { title: "…", description: "…" };

  const state = await translationState({ ...entry, i18n });
  assert.equal(state.state, "translated");
  assert.deepEqual(state.missing, []);
  assert.ok(DICTS.includes("en") && !TARGETS.includes("en"));

  assert.deepEqual((await planFor({ ...entry, i18n })).targets, []);
});

test("planFor: nothing when current, everything when stale, only the gaps when partial", async () => {
  const entry = event();
  const hash = await sourceHash(entry, FIELDS);

  assert.deepEqual((await planFor({ ...entry, i18n: full({ sourceHash: hash }) })).targets, []);
  assert.deepEqual(
    (await planFor({ ...entry, i18n: full({ sourceHash: hash }) }, { force: true })).targets,
    TARGETS.filter((d) => d !== "en"),
  );
  assert.deepEqual((await planFor({ ...entry, i18n: full({ sourceHash: "0000000000000000" }) })).targets, TARGETS);

  const partial = full({ sourceHash: hash });
  delete partial.bs;
  assert.deepEqual((await planFor({ ...entry, i18n: partial })).targets, ["bs"]);
});

test("mergeTranslations: a hand edit survives when the English text has not changed", () => {
  const entry = event();
  const existing = full({ sourceHash: "abcdef0123456789" });

  const merged = mergeTranslations({
    existing,
    submitted: { hr: { title: "Karaoke noć" } },
    hash: "abcdef0123456789",
  });

  assert.equal(merged.hr.title, "Karaoke noć");
  assert.equal(merged.hr.description, existing.hr.description, "the untouched field is kept");
  assert.equal(merged.bs.title, existing.bs.title, "other dictionaries are untouched");
  assert.equal(merged.sourceHash, "abcdef0123456789");
  assert.equal(entry.title, "Karaoke Night");
});

test("mergeTranslations: a hand edit beats machine output for the same field", () => {
  const merged = mergeTranslations({
    existing: full({ sourceHash: "abcdef0123456789" }),
    machine: { hr: { title: "Mašinski naslov" } },
    submitted: { hr: { title: "Ručni naslov" } },
    hash: "abcdef0123456789",
  });
  assert.equal(merged.hr.title, "Ručni naslov");
});

test("mergeTranslations: changed source text discards both the old block and the submitted edits", () => {
  const merged = mergeTranslations({
    existing: full({ sourceHash: "old0000000000000" }),
    machine: { hr: { title: "Novi naslov", description: "Novi opis" } },
    submitted: { bs: { title: "Ovo se odbacuje" } },
    hash: "new0000000000000",
    sourceLang: "en",
  });

  assert.equal(merged.sourceHash, "new0000000000000");
  assert.deepEqual(Object.keys(merged).sort(), ["hr", "sourceHash", "sourceLang"].sort());
  assert.equal(merged.hr.title, "Novi naslov");
});

test("mergeTranslations: nothing to write means no i18n key at all", () => {
  assert.equal(mergeTranslations({ hash: "abcdef0123456789" }), undefined);
  assert.equal(mergeTranslations({ machine: { hr: { title: "  " } }, hash: "abcdef0123456789" }), undefined);
  assert.equal(mergeTranslations({ machine: { xx: { title: "no such dictionary" } }, hash: "abcdef0123456789" }), undefined);
});

test("mergeTranslations: sourceLang is kept when the block still applies", () => {
  const kept = mergeTranslations({
    existing: full({ sourceHash: "abcdef0123456789", sourceLang: "de" }),
    hash: "abcdef0123456789",
    sourceLang: "en",
  });
  assert.equal(kept.sourceLang, "de");

  const fresh = mergeTranslations({
    machine: { hr: { title: "Naslov" } },
    hash: "abcdef0123456789",
    sourceLang: "de",
  });
  assert.equal(fresh.sourceLang, "de");
});

test("gate: clean output passes, Cyrillic in Serbian is an error naming the field", () => {
  const entry = event();

  assert.deepEqual(gate({ entry, i18n: full({ sourceHash: "abcdef0123456789" }), label: "karaoke" }).errors, []);

  const bad = full({ sourceHash: "abcdef0123456789", sr: { title: "Караоке вече" } });
  const { errors } = gate({ entry, i18n: bad, label: "karaoke" });
  assert.equal(errors.length, 1);
  assert.equal(errors[0].key, "karaoke:sr.title");
});
