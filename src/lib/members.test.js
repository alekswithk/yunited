import { test } from "node:test";
import assert from "node:assert/strict";

import { displayName, initialOf, isUnfilled } from "./members.js";

test("isUnfilled catches empty values and placeholder scaffolding", () => {
  assert.equal(isUnfilled(""), true);
  assert.equal(isUnfilled(null), true);
  assert.equal(isUnfilled("[PLACEHOLDER: Full Name]"), true);
  assert.equal(isUnfilled("Ana Marić"), false);
});

test("displayName returns a real name and hides an unannounced seat", () => {
  assert.equal(displayName({ name: "Ana Marić" }), "Ana Marić");
  assert.equal(displayName({ name: "[TBA]" }), null);
  assert.equal(displayName({ name: "" }), null);
});

test("initialOf normalizes names and never leaks placeholder text", () => {
  assert.equal(initialOf("  željka  "), "Ž");
  assert.equal(initialOf("[PLACEHOLDER: Full Name]"), "?");
  assert.equal(initialOf(""), "?");
  assert.equal(initialOf(null), "?");
});
