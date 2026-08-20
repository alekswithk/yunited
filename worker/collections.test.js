// The form and the schema must describe the same thing.
//
// This is the successor to a check that used to live in scripts/check-dist.mjs,
// back when the form was a Sveltia config.yml that had to be kept "in sync with
// src/lib/schema.js" by hand. The sync is now structural — the Worker validates
// with the schema itself — but one gap remains and it is the dangerous one: a
// field can exist in the SCHEMA and be missing from the FORM.
//
// Nothing catches that. The build stays green, the panel renders, and the board
// simply has no way to fill in a field the schema requires — so every save of
// that collection fails validation with a message about a field they cannot
// see. Add `subtitle` to eventSchema as required, forget the registry, and
// events become unsaveable.
//
// So: every schema key must be reachable, either as a form field, as the photo,
// or as a field explicitly carried through untouched.
import { test } from "node:test";
import assert from "node:assert/strict";

import { COLLECTIONS, isImageRequired, publicShape } from "./collections.js";
import { LANGUAGES } from "../src/lib/translate/glossary.js";
import { coerceField } from "./lib.js";

for (const [name, collection] of Object.entries(COLLECTIONS)) {
  test(`${name}: every schema field is reachable from the form`, () => {
    const schemaKeys = Object.keys(collection.schema.shape);
    const reachable = new Set([
      ...collection.fields.map((f) => f.name),
      collection.imageField,
      ...collection.carry,
    ]);

    for (const key of schemaKeys) {
      assert.ok(
        reachable.has(key),
        `${name}: "${key}" is in the Zod schema but nowhere in the registry — ` +
          `add it to fields[], or to carry[] if the board should never edit it.`,
      );
    }
  });

  test(`${name}: the form declares no field the schema would reject`, () => {
    // Every schema here is .strict(), so an unknown key is a hard failure at
    // build time — on a file the board saved successfully minutes earlier.
    const schemaKeys = new Set(Object.keys(collection.schema.shape));
    for (const field of collection.fields) {
      assert.ok(
        schemaKeys.has(field.name),
        `${name}: the form offers "${field.name}", which is not in the schema. ` +
          `The schemas are .strict(), so saving it would break the next build.`,
      );
    }
  });

  test(`${name}: every sort orders by a field that actually exists`, () => {
    const schemaKeys = new Set(Object.keys(collection.schema.shape));
    assert.ok(collection.sorts?.length, `${name}: declares no sorts`);

    for (const sort of collection.sorts) {
      // A sort naming a field the entries do not have would read `undefined`
      // for every row and quietly leave the list in whatever order it arrived
      // — no error, no empty list, just an ordering that ignores the choice.
      assert.ok(
        schemaKeys.has(sort.field),
        `${name}: sort "${sort.key}" orders by "${sort.field}", which is not in the schema`,
      );
      assert.ok(
        ["date", "number", "text"].includes(sort.type),
        `${name}: sort "${sort.key}" has type "${sort.type}"; admin.js only handles date/number/text`,
      );
      assert.ok(["asc", "desc"].includes(sort.dir), `${name}: sort "${sort.key}" has no valid dir`);
    }

    const keys = collection.sorts.map((s) => s.key);
    assert.equal(new Set(keys).size, keys.length, `${name}: duplicate sort keys`);
  });

  test(`${name}: a minimal entry — required fields only — validates`, () => {
    // What a board member creating their first entry actually submits: the
    // required fields typed in, every optional one left alone. If the empty
    // values are wrong (null where the schema wants "", say) this is where it
    // shows, rather than in a failed deploy after a real save.
    const values = {};
    for (const field of collection.fields) {
      values[field.name] = coerceField(sampleFor(field), field);
    }
    values[collection.imageField] = isImageRequired(collection)
      ? "images/events/26_27/sample.webp"
      : null;

    const result = collection.schema.safeParse(values);
    assert.ok(
      result.success,
      `${name}: a minimal entry was rejected — ` +
        JSON.stringify(result.success ? [] : result.error.issues, null, 2),
    );
  });
}

test("events carry their translations; members and partners have none to carry", () => {
  // The one asymmetry in the content model, and the one that bites silently:
  // a Git-based editor writes back only the fields it knows about, so `i18n`
  // must be in events' carry list or every save strips the translations.
  assert.ok(COLLECTIONS.events.carry.includes("i18n"));

  // And it must NOT appear for members or partners, which are deliberately
  // never translated — memberSchema/partnerSchema are .strict() and declare no
  // i18n at all, so writing one would fail the build.
  assert.equal(COLLECTIONS.members.carry.includes("i18n"), false);
  assert.equal(COLLECTIONS.partners.carry.includes("i18n"), false);
  assert.equal("i18n" in COLLECTIONS.members.schema.shape, false);
  assert.equal("i18n" in COLLECTIONS.partners.schema.shape, false);
});

test("the translations descriptor names real fields and real dictionaries", () => {
  // The panel renders the per-event Translations page from this. A typo here
  // renders an input whose contents the schema then rejects at save time —
  // exactly the drift that made Sveltia's second copy of the field list worth
  // deleting, so it is asserted rather than trusted.
  const spec = COLLECTIONS.events.translations;
  const names = COLLECTIONS.events.fields.map((f) => f.name);

  for (const field of spec.fields) {
    assert.ok(names.includes(field), `translations name "${field}", which is not a field`);
    assert.ok(field in COLLECTIONS.events.schema.shape, `"${field}" is not in the schema either`);
  }

  assert.ok(spec.locales.length > 0);
  for (const { code, label } of spec.locales) {
    assert.ok(LANGUAGES[code], `"${code}" is not a dictionary this site can produce`);
    assert.equal(typeof label, "string");
    assert.notEqual(label, "");
  }

  // Never for the collections that are deliberately never translated.
  assert.equal(COLLECTIONS.members.translations, undefined);
  assert.equal(COLLECTIONS.partners.translations, undefined);
  assert.equal(publicShape().find((c) => c.name === "members").translations, null);
});

test("an event's photo is required and a member's is not", () => {
  // Read off the schema, not asserted into it — this is a regression guard on
  // the probe in isImageRequired(), which is doing something non-obvious.
  assert.equal(isImageRequired(COLLECTIONS.events), true);
  assert.equal(isImageRequired(COLLECTIONS.members), false);
  assert.equal(isImageRequired(COLLECTIONS.partners), false);
});

/** A plausible value for a required field; "" for anything optional. */
function sampleFor(field) {
  if (!field.required) return "";
  switch (field.type) {
    case "number":
      return "1";
    case "date":
      return "2026-11-04";
    case "time":
      return "20:30";
    case "url":
      return "https://example.com/rsvp";
    default:
      return "Sample";
  }
}
