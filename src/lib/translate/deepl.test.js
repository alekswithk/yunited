// Pure-function tests for src/lib/translate/deepl.js — the parts that don't touch
// the network, per CLAUDE.md's testing rule. No API key needed; no request is
// made. toSerbianLatin in particular had never been unit-tested before this:
// it previously lived in a deleted module and its only proof was the committed
// sr.json output, which does not exercise the digraph-casing edge case below.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  apiUrlFor,
  decodeEntities,
  lostPlaceholders,
  postProcess,
  protect,
  toSerbianLatin,
  unprotect,
} from "./deepl.js";

test("protect wraps a protected term and unprotect removes the wrapper", () => {
  const wrapped = protect("Join YUnited at HSG");
  assert.equal(wrapped, "Join <x>YUnited</x> at <x>HSG</x>");
  assert.equal(unprotect(wrapped), "Join YUnited at HSG");
});

test("protect prefers the longest match, so a substring term doesn't shadow it", () => {
  // "St. Gallen" would be masked by a shorter overlapping term if the list
  // weren't sorted longest-first — glossary.js guarantees the sort, this
  // guards the ordering assumption deepl.js's regex depends on.
  assert.equal(protect("uniclubs.ch"), "<x>uniclubs.ch</x>");
});

test("decodeEntities turns HTML entities back into characters", () => {
  assert.equal(decodeEntities("Meet &amp; Greet &quot;YUnited&quot;"), 'Meet & Greet "YUnited"');
});

test("toSerbianLatin converts plain Cyrillic letters", () => {
  assert.equal(toSerbianLatin("Добродошли у клуб"), "Dobrodošli u klub");
});

test("toSerbianLatin: Љ/Њ/Џ split into two letters, cased by what follows", () => {
  // Word-initial: second letter lowercase.
  assert.equal(toSerbianLatin("Љубав"), "Ljubav");
  // Inside an all-caps word: both letters uppercase.
  assert.equal(toSerbianLatin("ЉУБАВ"), "LJUBAV");
  // At the very end of the string there is no following letter to check —
  // must not throw, and defaults to the lowercase second letter.
  assert.equal(toSerbianLatin("stanuje u Кучево, а рођен у Београд, Њ"), "stanuje u Kučevo, a rođen u Beograd, Nj");
});

test("toSerbianLatin leaves Latin text untouched", () => {
  assert.equal(toSerbianLatin("YUnited HSG St. Gallen"), "YUnited HSG St. Gallen");
});

test("postProcess strips quotes DeepL adds around a protected name", () => {
  assert.equal(postProcess("Prijavi se na „HSG“ portal", "hr"), "Prijavi se na HSG portal");
});

test("postProcess normalizes German ß to Swiss ss, only for de", () => {
  assert.equal(postProcess("Wir schließen um 18 Uhr", "de"), "Wir schliessen um 18 Uhr");
  assert.equal(postProcess("Straße", "hr"), "Straße");
});

test("postProcess converts Serbian output to Latin script", () => {
  assert.equal(postProcess("Добродошли", "sr"), "Dobrodošli");
});

test("postProcess unwraps the <x> protection markers", () => {
  assert.equal(postProcess("Pridruži se <x>YUnited</x> klubu", "hr"), "Pridruži se YUnited klubu");
});

test("lostPlaceholders finds a {placeholder} missing from the translation", () => {
  assert.deepEqual(lostPlaceholders("Portrait of {name}", "Portret osobe"), ["{name}"]);
  assert.deepEqual(lostPlaceholders("Portrait of {name}", "Portret {name}"), []);
});

test("apiUrlFor routes a free-tier key (':fx' suffix) to the free endpoint", () => {
  assert.equal(apiUrlFor("abcd1234:fx"), "https://api-free.deepl.com/v2/translate");
  assert.equal(apiUrlFor("abcd1234"), "https://api.deepl.com/v2/translate");
});
