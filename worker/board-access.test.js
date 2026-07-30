// Unit tests for the board access-list logic.
//
// Everything tested here is a pure function, for the same reason the rest of
// worker/ is arranged this way: the failures that matter are invisible to every
// other command. `npm test`, `build`, `check` and `check:dist` all pass just as
// happily if a save quietly drops a rule the board did not know about, or if the
// lockout guard compares addresses case-sensitively and lets somebody delete
// their own access.
//
// The write-body tests are the load-bearing ones. Cloudflare's PUT replaces the
// whole group, so a missing key there is not a cosmetic bug — it silently
// destroys configuration nobody will notice is gone until a sign-in fails.

import test from "node:test";
import assert from "node:assert/strict";

import {
  conflict,
  describeChange,
  emailsFromRules,
  guardChange,
  normalizeEmails,
  partitionRules,
  rulesFromEmails,
  validateEmail,
  writeBody,
} from "./board-access.js";

test("normalizeEmails: trims, lowercases, de-duplicates, keeps order", () => {
  assert.deepEqual(
    normalizeEmails(["  Ana@HSG.ch ", "bob@hsg.ch", "ANA@hsg.ch", "", "   ", null, 7]),
    ["ana@hsg.ch", "bob@hsg.ch"],
    "the list is shown in the group's own order, so order must survive normalising",
  );
  assert.deepEqual(normalizeEmails(undefined), [], "a missing list is an empty one, not a crash");
});

test("validateEmail: accepts an address, rejects the near-misses", () => {
  assert.equal(validateEmail("ana@hsg.ch"), null);
  assert.equal(validateEmail("  ana@hsg.ch  "), null, "the input is trimmed before checking");

  for (const bad of ["", "   ", "not-an-email", "ana@", "hsg.ch", "ana@hsg", "a b@hsg.ch"]) {
    assert.notEqual(validateEmail(bad), null, `“${bad}” should be refused`);
  }
});

test("rulesFromEmails / emailsFromRules round-trip the documented rule shape", () => {
  const rules = rulesFromEmails(["Ana@hsg.ch", "bob@hsg.ch"]);
  assert.deepEqual(rules, [
    { email: { email: "ana@hsg.ch" } },
    { email: { email: "bob@hsg.ch" } },
  ]);
  assert.deepEqual(emailsFromRules(rules), ["ana@hsg.ch", "bob@hsg.ch"]);
});

test("partitionRules keeps every rule that is not an email address", () => {
  const include = [
    { email: { email: "ana@hsg.ch" } },
    { group: { id: "aa0a4aab-672b-4bdb-bc33-a59f1130a11f" } },
    { email_domain: { domain: "hsg.ch" } },
    { email: { email: "bob@hsg.ch" } },
  ];

  const { emails, others } = partitionRules(include);
  assert.deepEqual(emails, ["ana@hsg.ch", "bob@hsg.ch"]);
  assert.deepEqual(
    others,
    [{ group: { id: "aa0a4aab-672b-4bdb-bc33-a59f1130a11f" } }, { email_domain: { domain: "hsg.ch" } }],
    "a nested group or a whole allowed domain is somebody's deliberate configuration",
  );
});

test("writeBody echoes back every field a PUT would otherwise destroy", () => {
  const group = {
    id: "9b1c…",
    name: "yunited-board",
    include: [
      { email_domain: { domain: "hsg.ch" } },
      { email: { email: "old@hsg.ch" } },
    ],
    exclude: [{ email: { email: "left-the-board@hsg.ch" } }],
    require: [{ geo: { country_code: "CH" } }],
    is_default: false,
    created_at: "2026-01-01T00:00:00Z",
  };

  const body = writeBody(group, ["new@hsg.ch"]);

  assert.equal(body.name, "yunited-board", "omitting the name renames the group");
  assert.deepEqual(body.exclude, group.exclude, "omitting exclude clears it");
  assert.deepEqual(body.require, group.require, "omitting require clears it");
  assert.equal(body.is_default, false);
  assert.deepEqual(
    body.include,
    [{ email_domain: { domain: "hsg.ch" } }, { email: { email: "new@hsg.ch" } }],
    "non-email rules stay, in their original order, and only the addresses are replaced",
  );

  // The whole point of the PUT: what we did not send is gone.
  assert.deepEqual(emailsFromRules(body.include), ["new@hsg.ch"]);
});

test("writeBody survives a group with nothing in it", () => {
  assert.deepEqual(writeBody({ name: "yunited-board" }, ["ana@hsg.ch"]), {
    name: "yunited-board",
    include: [{ email: { email: "ana@hsg.ch" } }],
    exclude: [],
    require: [],
    is_default: false,
  });
});

test("guardChange refuses to empty the list", () => {
  const message = guardChange({ current: ["ana@hsg.ch"], next: [], actor: "ana@hsg.ch" });
  assert.match(String(message), /nobody able to sign in/);
});

test("guardChange refuses to remove the person making the change", () => {
  const message = guardChange({
    current: ["ana@hsg.ch", "bob@hsg.ch"],
    next: ["bob@hsg.ch"],
    actor: "  ANA@hsg.ch ",
  });
  assert.match(
    String(message),
    /lock you out/,
    "the Access header's capitalisation is not ours to predict, so the check is case-insensitive",
  );
});

test("guardChange allows removing somebody else, and adding anybody", () => {
  assert.equal(
    guardChange({ current: ["ana@hsg.ch", "bob@hsg.ch"], next: ["ana@hsg.ch"], actor: "ana@hsg.ch" }),
    null,
  );
  assert.equal(
    guardChange({
      current: ["ana@hsg.ch"],
      next: ["ana@hsg.ch", "carla@hsg.ch"],
      actor: "ana@hsg.ch",
    }),
    null,
  );
});

test("guardChange still protects the list when the actor is unknown", () => {
  // Running locally there is no Access header, so `actor` is null. Emptying the
  // list must still be refused; removing "yourself" cannot be checked.
  assert.equal(guardChange({ current: ["ana@hsg.ch"], next: ["bob@hsg.ch"], actor: null }), null);
  assert.match(String(guardChange({ current: ["ana@hsg.ch"], next: [], actor: null })), /nobody/);
});

test("conflict detects the group having moved, and ignores harmless differences", () => {
  assert.equal(conflict(["ana@hsg.ch"], ["ana@hsg.ch", "bob@hsg.ch"]), true);
  assert.equal(conflict(["ana@hsg.ch", "bob@hsg.ch"], ["bob@hsg.ch", "ana@hsg.ch"]), true);
  assert.equal(conflict(["ANA@hsg.ch "], ["ana@hsg.ch"]), false, "same list, different typing");
  assert.equal(
    conflict(undefined, ["ana@hsg.ch"]),
    false,
    "a client that sends no expectation is not claiming one",
  );
});

test("describeChange names what happened, for the only per-person audit trail", () => {
  assert.equal(describeChange(["a@x.ch"], ["a@x.ch", "b@x.ch"]), "added b@x.ch");
  assert.equal(describeChange(["a@x.ch", "b@x.ch"], ["a@x.ch"]), "removed b@x.ch");
  assert.equal(describeChange(["a@x.ch"], ["b@x.ch"]), "added b@x.ch; removed a@x.ch");
  assert.equal(describeChange(["a@x.ch"], ["a@x.ch"]), "no change");
});
