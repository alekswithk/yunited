import { test } from "node:test";
import assert from "node:assert/strict";

import { parseSignup, firstSignupProblem, normalizeSignup } from "./schema.js";

const seekerForm = {
  role: "seeker",
  name: "  Mara Jovanović ",
  email: "Mara.Jovanovic@STUDENT.unisg.ch",
  audience: "hsg",
  studyLevel: "assessment",
  languages: "BCS, English",
  note: "First-year, moved from Novi Sad.",
  consent: "on",
  isMember: "on",
  locale: "hr",
};

test("a complete seeker signup parses and is normalized", () => {
  const result = parseSignup(seekerForm);
  assert.ok(result.success, JSON.stringify(result.error?.issues));
  assert.equal(result.data.name, "Mara Jovanović");
  assert.equal(result.data.email, "mara.jovanovic@student.unisg.ch");
  assert.equal(result.data.consent, true);
  assert.equal(result.data.isMember, true);
  assert.equal(result.data.locale, "hr");
  // Seeker defaults for the buddy-only fields.
  assert.equal(result.data.capacity, 1);
  assert.equal(result.data.openToExtra, false);
});

test("a buddy signup keeps capacity and the extra toggle", () => {
  const result = parseSignup({
    role: "buddy",
    name: "Ivan Perić",
    email: "ivan@student.unisg.ch",
    audience: "hsg",
    capacity: "3",
    openToExtra: "on",
    consent: "true",
  });
  assert.ok(result.success);
  assert.equal(result.data.capacity, 3);
  assert.equal(result.data.openToExtra, true);
});

test("missing consent is rejected with a usable message", () => {
  const result = parseSignup({ ...seekerForm, consent: "" });
  assert.equal(result.success, false);
  const problem = firstSignupProblem(result);
  assert.equal(problem.field, "consent");
  assert.match(problem.message, /consent/i);
});

test("a malformed email is rejected", () => {
  const result = parseSignup({ ...seekerForm, email: "mara@student" });
  assert.equal(result.success, false);
  assert.equal(firstSignupProblem(result).field, "email");
});

test("an unknown role is rejected", () => {
  const result = parseSignup({ ...seekerForm, role: "mentor" });
  assert.equal(result.success, false);
  assert.equal(firstSignupProblem(result).field, "role");
});

test("capacity is clamped to the 1–3 range by the schema", () => {
  assert.equal(parseSignup({ ...seekerForm, role: "buddy", capacity: "9" }).success, false);
  assert.equal(parseSignup({ ...seekerForm, role: "buddy", capacity: "0" }).success, false);
});

test("an unknown locale falls back to English, an unknown study level to null", () => {
  const norm = normalizeSignup({ ...seekerForm, locale: "it", studyLevel: "phd" });
  assert.equal(norm.locale, "en");
  assert.equal(norm.studyLevel, null);
});

test("firstSignupProblem returns null for a valid result", () => {
  assert.equal(firstSignupProblem(parseSignup(seekerForm)), null);
});
