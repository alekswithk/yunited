import { test } from "node:test";
import assert from "node:assert/strict";

import { randomToken, isToken, timingSafeEqual } from "./tokens.js";

test("randomToken is URL-safe and the right shape", () => {
  for (let i = 0; i < 200; i++) {
    const tok = randomToken();
    assert.match(tok, /^[A-Za-z0-9_-]+$/);
    assert.ok(isToken(tok), tok);
  }
});

test("randomToken does not collide across many draws", () => {
  const seen = new Set();
  for (let i = 0; i < 5000; i++) seen.add(randomToken());
  assert.equal(seen.size, 5000);
});

test("randomToken length scales with the byte count", () => {
  assert.ok(randomToken(12).length < randomToken(48).length);
});

test("isToken rejects the obvious bad inputs", () => {
  assert.equal(isToken(""), false);
  assert.equal(isToken("short"), false);
  assert.equal(isToken("has spaces in it and is long enough"), false);
  assert.equal(isToken("../etc/passwd/../../aaaaaaaaaaaaaaa"), false);
  assert.equal(isToken(null), false);
  assert.equal(isToken(undefined), false);
});

test("timingSafeEqual matches only identical strings", () => {
  const tok = randomToken();
  assert.equal(timingSafeEqual(tok, tok), true);
  assert.equal(timingSafeEqual(tok, tok.slice(0, -1) + "x"), false);
  assert.equal(timingSafeEqual(tok, tok + "x"), false);
  assert.equal(timingSafeEqual("a", 1), false);
});
