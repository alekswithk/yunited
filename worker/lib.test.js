// Tests for the admin Worker's pure logic.
//
// Same rationale as src/lib/events.test.js: these functions decide things that
// no build and no type-check can check. A wrong slug, a wrong image folder or a
// blank field coerced to the wrong empty value produces a perfectly successful
// commit that is simply wrong — and, in the coercion case, one that fails the
// NEXT build rather than this request. node:test, no framework, `now` injected
// so nothing here rots on a date change.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  academicYear,
  buildEntry,
  coerceField,
  eventSlug,
  extensionOf,
  imagePathFor,
  slugify,
  uniqueSlug,
} from "./lib.js";

test("slugify: the shapes that actually occur in this repo", () => {
  assert.equal(slugify("Casino Night"), "casino-night");
  // "&" spelled out rather than dropped — "meet-greet" would read as a typo.
  assert.equal(slugify("Meet & Greet"), "meet-and-greet");
  assert.equal(slugify("Prvi Maj"), "prvi-maj");
  // Regional diacritics fold to ASCII instead of disappearing.
  assert.equal(slugify("Čaj i Šah"), "caj-i-sah");
  assert.equal(slugify("Đurđevdan"), "durdevdan");
  assert.equal(slugify("Movie Night: Svadba"), "movie-night-svadba");
  // Punctuation and runs of spaces collapse; no leading or trailing dashes.
  assert.equal(slugify("  Post-Midterm  Brunch!  "), "post-midterm-brunch");
});

test("academicYear: the season rolls over in August, not January", () => {
  // Everything in src/images/events/25_26 is from this window.
  assert.equal(academicYear("2025-12-11"), "25_26"); // Christmas dinner
  assert.equal(academicYear("2026-05-01"), "25_26"); // Prvi Maj
  assert.equal(academicYear("2026-07-31"), "25_26"); // last day of the season
  assert.equal(academicYear("2026-08-01"), "26_27"); // first day of the next
  assert.equal(academicYear("2026-09-20"), "26_27");
  // A TBA event falls back to today's season.
  assert.equal(academicYear(null, new Date("2026-09-20T12:00:00Z")), "26_27");
  assert.equal(academicYear(undefined, new Date("2026-03-02T12:00:00Z")), "25_26");
});

test("eventSlug: the year suffix matches the ids already in content/events", () => {
  const now = new Date("2026-07-28T12:00:00Z");
  assert.equal(eventSlug("Meet & Greet", null, now), "meet-and-greet-2026");
  assert.equal(eventSlug("Christmas Dinner", "2025-12-11", now), "christmas-dinner-2025");
  assert.equal(eventSlug("Casino Night", "2026-03-19", now), "casino-night-2026");
  // A title that already ends in a year is left alone rather than doubled up.
  assert.equal(eventSlug("Semester End Party 2026", "2026-05-28", now), "semester-end-party-2026");
});

test("uniqueSlug: a repeated name is disambiguated, not rejected", () => {
  const taken = ["karaoke-2026", "karaoke-2026-2"];
  assert.equal(uniqueSlug("casino-night-2026", taken), "casino-night-2026");
  assert.equal(uniqueSlug("karaoke-2026", taken), "karaoke-2026-3");
});

test("extensionOf / imagePathFor: photos are filed the way the repo already files them", () => {
  assert.equal(extensionOf("IMG_1234.JPG"), "jpg");
  assert.equal(extensionOf("photo.final.webp"), "webp");
  assert.equal(extensionOf("no-extension"), "");
  // Dashes in the slug become underscores in the filename:
  // meet_and_greet_2026.webp sits beside meet-and-greet-2026.json.
  assert.equal(
    imagePathFor("images/events/26_27", "meet-and-greet-2026", "webp"),
    "images/events/26_27/meet_and_greet_2026.webp",
  );
});

test("coerceField: a blank optional field is null, a blank plain string stays ''", () => {
  // THE distinction this function exists for. memberSchema types `name` as a
  // plain string: "" is a valid "seat filled, not announced yet", null is not.
  const optional = { type: "string", emptyValue: null };
  const plain = { type: "string", emptyValue: "" };

  assert.equal(coerceField("", optional), null);
  assert.equal(coerceField("   ", optional), null);
  assert.equal(coerceField(null, optional), null);
  assert.equal(coerceField("", plain), "");
  assert.equal(coerceField(null, plain), "");

  assert.equal(coerceField("  Déja Vu Bar  ", optional), "Déja Vu Bar");

  // A blank number is null, so the schema says "expected a number" against the
  // field instead of silently storing 0 and reordering the whole board.
  const order = { type: "number", emptyValue: null };
  assert.equal(coerceField("", order), null);
  assert.equal(coerceField("3", order), 3);
});

test("buildEntry: carried fields survive, and absent ones stay absent", () => {
  const fields = [{ name: "title" }, { name: "date" }, { name: "image" }];
  const values = { title: "Karaoke", date: "2026-11-04", image: "images/events/26_27/karaoke.webp" };

  // A new entry has no id and no translations, and must not be written with
  // empty ones — `"id": null` in a fresh file contradicts the rule that the
  // filename is the id.
  assert.deepEqual(Object.keys(buildEntry(fields, values)), ["title", "date", "image"]);

  // An edit of an existing entry MUST carry the machine-written i18n block
  // through untouched. Dropping it would strip every translation on every save
  // — the single most damaging thing this code could quietly do.
  const carried = { id: "karaoke-2026", i18n: { sourceLang: "en", sourceHash: "abc12345" } };
  const entry = buildEntry(fields, values, carried);
  assert.deepEqual(Object.keys(entry).sort(), ["date", "i18n", "id", "image", "title"]);
  assert.deepEqual(entry.i18n, carried.i18n);
  assert.equal(entry.id, "karaoke-2026");

  // `id` first, then the form's fields, then whatever else is carried. The
  // helper used to name `i18n` explicitly, which meant adding a carried key
  // needed an edit in two files — and forgetting the second one drops the key
  // with no error anywhere.
  const extra = buildEntry(fields, values, { id: "karaoke-2026", i18n: { a: 1 }, somethingNew: { b: 2 } });
  assert.deepEqual(Object.keys(extra), ["id", "title", "date", "image", "i18n", "somethingNew"]);

  // undefined is not a value: it means "not carried", and writing the key
  // would put `"i18n": null` in a file that has no translations.
  assert.equal("i18n" in buildEntry(fields, values, { i18n: undefined }), false);
});
