// The inline copy editor's allow-list, checked against the real en.json.
//
// This is invisible-defect territory: too wide and the board can rewrite nav,
// meta or aria strings from the page (a lengthened toc.* label breaks the
// About-page rail with nothing to catch it); too narrow and obvious body copy
// is not editable. worker/copy.test.js and scripts/check-dist.mjs pin the ends;
// this pins the middle against the dictionary as it actually is.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { isEditableCopyKey, ALLOW_PREFIXES } from "./editable.js";
import { flatten } from "../translate/flat.js";

const en = flatten(
  JSON.parse(readFileSync(fileURLToPath(new URL("../../i18n/en.json", import.meta.url)), "utf8")),
);
const editable = Object.keys(en).filter((k) => isEditableCopyKey(k, en[k]));

test("named cases", () => {
  assert.equal(isEditableCopyKey("about.missionP1", en["about.missionP1"]), true);
  assert.equal(isEditableCopyKey("home.whoBody", en["home.whoBody"]), true);
  assert.equal(isEditableCopyKey("about.buddyMorePre", en["about.buddyMorePre"]), false); // split
  assert.equal(isEditableCopyKey("home.mapTitle", en["home.mapTitle"]), false); // {location}
  assert.equal(isEditableCopyKey("nav.events", en["nav.events"]), false); // prefix
  assert.equal(isEditableCopyKey("meta.about.title", en["meta.about.title"]), false); // prefix
  assert.equal(isEditableCopyKey("skipLink", en["skipLink"]), false); // deny
});

test("only about.* and home.* keys are editable", () => {
  for (const key of editable) {
    assert.ok(
      ALLOW_PREFIXES.some((p) => key.startsWith(p)),
      `${key} is editable but outside ALLOW_PREFIXES`,
    );
  }
});

test("no editable key carries markup, an interpolation slot, or a split-sentence suffix", () => {
  for (const key of editable) {
    assert.doesNotMatch(en[key], /<[a-z/]/i, `${key} contains markup`);
    assert.doesNotMatch(en[key], /\{\w+\}/, `${key} contains an interpolation slot`);
    assert.doesNotMatch(key, /(Pre|Link|Post)$/, `${key} is a split-sentence third`);
  }
});

test("the editable set is exactly (allowed prefixes) minus (markup ∪ interp ∪ split ∪ deny)", () => {
  const expected = Object.keys(en).filter((k) => {
    if (!ALLOW_PREFIXES.some((p) => k.startsWith(p))) return false;
    const v = en[k];
    if (typeof v !== "string" || v.trim() === "") return false;
    if (/<[a-z/]/i.test(v)) return false;
    if (/\{\w+\}/.test(v)) return false;
    if (/(Pre|Link|Post)$/.test(k)) return false;
    return true;
  });
  assert.deepEqual(editable.sort(), expected.sort());
  assert.ok(editable.length >= 20, `expected a healthy editable set, got ${editable.length}`);
});

test("a blank or non-string value is never editable", () => {
  assert.equal(isEditableCopyKey("about.x", ""), false);
  assert.equal(isEditableCopyKey("about.x", "   "), false);
  assert.equal(isEditableCopyKey("about.x", 42), false);
  assert.equal(isEditableCopyKey("about.x", null), false);
});
