import test from "node:test";
import assert from "node:assert/strict";

import { buddyStore } from "./buddy-store.js";

const compact = (sql) => sql.replace(/\s+/g, " ").trim();

function fakeD1({ first = () => null, all = () => [], run = () => ({}) } = {}) {
  const calls = [];
  const statement = (sql) => ({
    sql: compact(sql),
    binds: [],
    bind(...values) {
      this.binds = values;
      return this;
    },
    async first() {
      calls.push({ op: "first", sql: this.sql, binds: this.binds });
      return first(this.sql, this.binds);
    },
    async all() {
      calls.push({ op: "all", sql: this.sql, binds: this.binds });
      return { results: all(this.sql, this.binds) };
    },
    async run() {
      calls.push({ op: "run", sql: this.sql, binds: this.binds });
      return run(this.sql, this.binds);
    },
  });

  return {
    calls,
    prepare: statement,
    async batch(statements) {
      calls.push({
        op: "batch",
        statements: statements.map(({ sql, binds }) => ({ sql, binds })),
      });
      return statements.map(() => ({ success: true }));
    },
  };
}

test("lookup and list methods bind their filters and return D1 rows", async () => {
  const db = fakeD1({
    first: (sql) => sql.includes(" AS buddies") ? { buddies: 2 } : { id: "row" },
    all: () => [{ id: "one" }, { id: "two" }],
  });
  const store = buddyStore(db);

  assert.deepEqual(await store.findActiveByEmail("a@x.ch"), { id: "row" });
  assert.deepEqual(await store.findByVerifyToken("verify"), { id: "row" });
  assert.deepEqual(await store.findByManageToken("manage"), { id: "row" });
  assert.deepEqual(await store.findPairByToken("pair"), { id: "row" });
  assert.deepEqual(await store.signupById("signup"), { id: "row" });
  assert.deepEqual(await store.lastRound(), { id: "row" });
  assert.deepEqual(await store.roundById("round"), { id: "row" });
  assert.deepEqual(await store.counts(), { buddies: 2 });
  assert.deepEqual(await store.activeBuddies(), [{ id: "one" }, { id: "two" }]);
  assert.deepEqual(await store.unmatchedSeekers(), [{ id: "one" }, { id: "two" }]);
  assert.deepEqual(await store.roundPairs("round"), [{ id: "one" }, { id: "two" }]);
  assert.deepEqual(await store.allSignups(), [{ id: "one" }, { id: "two" }]);
  assert.deepEqual(await store.pendingSignups(), [{ id: "one" }, { id: "two" }]);

  const pairLookup = db.calls.find((call) => call.sql?.includes("buddy_token = ?1 OR seeker_token = ?1"));
  assert.deepEqual(pairLookup.binds, ["pair"]);
  const emailLookup = db.calls.find((call) => call.sql?.includes("email = ?1"));
  assert.deepEqual(emailLookup.binds, ["a@x.ch"]);
});

test("signup lifecycle writes every value in schema order", async () => {
  const db = fakeD1();
  const store = buddyStore(db);
  const row = {
    id: "s1",
    role: "buddy",
    name: "Ana",
    email: "ana@x.ch",
    verifyToken: "verify",
    manageToken: "manage",
    audience: "hsg",
    studyLevel: "master",
    languages: "bs,en",
    note: "Hi",
    capacity: 2,
    openToExtra: true,
    isMember: false,
    locale: "bs",
    now: "2026-09-08T12:00:00.000Z",
  };

  await store.insertSignup(row);
  await store.refreshPending("s1", "verify-2", "later");
  await store.markVerified("s1", "later");
  await store.withdraw("s1", "later");

  assert.deepEqual(db.calls[0].binds, [
    "s1", "buddy", "Ana", "ana@x.ch", "verify", "manage", "hsg", "master",
    "bs,en", "Hi", 2, 1, 0, "bs", "2026-09-08T12:00:00.000Z",
  ]);
  assert.deepEqual(db.calls.slice(1).map((call) => call.binds), [
    ["s1", "verify-2", "later"],
    ["s1", "later"],
    ["s1", "later"],
  ]);
});

test("round writes batch pairs and de-duplicates assigned people", async () => {
  const db = fakeD1();
  const store = buddyStore(db);

  await store.createRound({ id: "r1", seed: "seed", now: "now", by: "board@hsg.ch" });
  await store.insertPairs([
    { id: "p1", roundId: "r1", buddyId: "b1", seekerId: "s1", buddyToken: "bt1", seekerToken: "st1", basis: "fill", now: "now" },
    { id: "p2", roundId: "r1", buddyId: "b1", seekerId: "s2", buddyToken: "bt2", seekerToken: "st2", basis: "overflow", now: "now" },
  ]);
  await store.assignRound(["b1", "s1", "b1", "s2"], "r1", "now");
  await store.markRoundNotified("r1", "later");
  await store.setPairConfirmed("p1", "buddy");
  await store.setPairConfirmed("p1", "seeker");
  await store.flagPair("p1");

  assert.deepEqual(db.calls[0].binds, ["r1", "seed", "now", "board@hsg.ch"]);
  assert.equal(db.calls[1].op, "batch");
  assert.deepEqual(db.calls[1].statements.map((stmt) => stmt.binds), [
    ["p1", "r1", "b1", "s1", "bt1", "st1", "fill", "now"],
    ["p2", "r1", "b1", "s2", "bt2", "st2", "overflow", "now"],
  ]);
  assert.deepEqual(db.calls[2].binds, ["r1", "now", "b1", "s1", "s2"]);
  assert.match(db.calls[4].sql, /buddy_confirmed = 1/);
  assert.match(db.calls[5].sql, /seeker_confirmed = 1/);
});

test("empty bulk writes are no-ops and deletion counts come from D1 metadata", async () => {
  const db = fakeD1({ run: (sql) => sql.startsWith("DELETE FROM signups WHERE status") ? { meta: { changes: 3 } } : {} });
  const store = buddyStore(db);

  await store.insertPairs([]);
  await store.assignRound([], "r1", "now");
  assert.equal(db.calls.length, 0);

  await store.removeSignup("s1");
  assert.equal(await store.purgeStalePending("cutoff"), 3);
  assert.deepEqual(db.calls.map((call) => call.binds), [["s1"], ["cutoff"]]);
});
