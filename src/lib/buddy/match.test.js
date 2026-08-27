import { test } from "node:test";
import assert from "node:assert/strict";

import { planMatches, rngFromSeed, shuffle } from "./match.js";

const seekers = (n) => Array.from({ length: n }, (_, i) => ({ id: `s${i + 1}` }));

test("shuffle: a permutation of the input, and the input is untouched", () => {
  const input = seekers(6);
  const copy = input.slice();
  const out = shuffle(input, rngFromSeed(1));
  assert.deepEqual(input, copy, "input array must not be mutated");
  assert.deepEqual(
    out.map((s) => s.id).sort(),
    input.map((s) => s.id).sort(),
  );
});

test("enough capacity: everyone matched, all by fill, nobody idle", () => {
  const result = planMatches({
    buddies: [
      { id: "b1", capacity: 1 },
      { id: "b2", capacity: 1 },
      { id: "b3", capacity: 1 },
    ],
    seekers: seekers(3),
    seed: 42,
  });
  assert.equal(result.pairs.length, 3);
  assert.equal(result.unmatchedSeekers.length, 0);
  assert.equal(result.idleBuddies.length, 0);
  assert.ok(result.pairs.every((p) => p.basis === "fill"));
});

test("fill spreads evenly and never exceeds a buddy's stated capacity", () => {
  // One buddy offered 3, one offered 1. Four seekers: the cap-3 buddy takes 3,
  // the cap-1 buddy takes 1 — nobody goes over, because neither opted for extra.
  const result = planMatches({
    buddies: [
      { id: "big", capacity: 3 },
      { id: "small", capacity: 1 },
    ],
    seekers: seekers(4),
    seed: 7,
  });
  assert.equal(result.load.big, 3);
  assert.equal(result.load.small, 1);
  assert.equal(result.unmatchedSeekers.length, 0);
  assert.ok(result.pairs.every((p) => p.basis === "fill"));
});

test("overflow lands only on buddies who opted in", () => {
  // Two buddies, capacity 1 each. Only `open` ticked "extra if short". Three
  // seekers → `open` takes 2 (one of them overflow), `closed` stays at 1.
  const result = planMatches({
    buddies: [
      { id: "open", capacity: 1, openToExtra: true },
      { id: "closed", capacity: 1, openToExtra: false },
    ],
    seekers: seekers(3),
    seed: 123,
  });
  assert.equal(result.load.open, 2);
  assert.equal(result.load.closed, 1);
  assert.equal(result.unmatchedSeekers.length, 0);
  assert.equal(result.pairs.filter((p) => p.basis === "overflow").length, 1);
  assert.ok(
    result.pairs
      .filter((p) => p.basis === "overflow")
      .every((p) => p.buddyId === "open"),
  );
});

test("overflow keeps stacking onto opted-in buddies when very short", () => {
  const result = planMatches({
    buddies: [{ id: "solo", capacity: 1, openToExtra: true }],
    seekers: seekers(4),
    seed: 5,
  });
  assert.equal(result.load.solo, 4);
  assert.equal(result.unmatchedSeekers.length, 0);
  assert.equal(result.pairs.filter((p) => p.basis === "overflow").length, 3);
});

test("no opted-in buddies: the remainder is held, not force-fitted", () => {
  const result = planMatches({
    buddies: [{ id: "b1", capacity: 1 }],
    seekers: seekers(3),
    seed: 9,
  });
  assert.equal(result.pairs.length, 1);
  assert.equal(result.unmatchedSeekers.length, 2);
});

test("more buddies than seekers: the surplus buddies are idle", () => {
  const result = planMatches({
    buddies: [{ id: "b1" }, { id: "b2" }, { id: "b3" }],
    seekers: seekers(1),
    seed: 2,
  });
  assert.equal(result.pairs.length, 1);
  assert.equal(result.idleBuddies.length, 2);
});

test("no buddies at all: everyone is unmatched", () => {
  const result = planMatches({ buddies: [], seekers: seekers(2), seed: 1 });
  assert.equal(result.pairs.length, 0);
  assert.equal(result.unmatchedSeekers.length, 2);
});

test("a fixed seed reproduces the exact pairing", () => {
  const input = {
    buddies: [
      { id: "b1", capacity: 2 },
      { id: "b2", capacity: 2 },
      { id: "b3", capacity: 2, openToExtra: true },
    ],
    seekers: seekers(7),
    seed: 20260827,
  };
  const a = planMatches(input);
  const b = planMatches(input);
  assert.deepEqual(a.pairs, b.pairs);
  assert.deepEqual(a.unmatchedSeekers, b.unmatchedSeekers);
  assert.equal(a.seed, 20260827);
});

test("the pairing does not depend on input row order", () => {
  const buddies = [
    { id: "b1", capacity: 2 },
    { id: "b2", capacity: 2 },
  ];
  const forward = planMatches({ buddies, seekers: seekers(4), seed: 88 });
  const reversed = planMatches({
    buddies: buddies.slice().reverse(),
    seekers: seekers(4).reverse(),
    seed: 88,
  });
  assert.deepEqual(
    forward.pairs.slice().sort((x, y) => x.seekerId.localeCompare(y.seekerId)),
    reversed.pairs.slice().sort((x, y) => x.seekerId.localeCompare(y.seekerId)),
  );
});

test("every seeker appears exactly once, matched or unmatched", () => {
  const result = planMatches({
    buddies: [
      { id: "b1", capacity: 2 },
      { id: "b2", capacity: 1, openToExtra: true },
    ],
    seekers: seekers(10),
    seed: 555,
  });
  const seen = [
    ...result.pairs.map((p) => p.seekerId),
    ...result.unmatchedSeekers,
  ].sort();
  assert.deepEqual(seen, seekers(10).map((s) => s.id).sort());
});
