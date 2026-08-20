// What the panel is told about translations.
//
// The rules themselves are tested in src/lib/translate/content.test.js; these
// cases are about the Worker's side of the wire — the shape the browser
// receives, and the collections that must never grow a badge.

import { test } from "node:test";
import assert from "node:assert/strict";

import { sourceHash } from "../src/lib/translate/content.js";
import { stateOf, translatableFields, withTranslationState } from "./translate.js";

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
