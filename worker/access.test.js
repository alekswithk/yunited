// Unit tests for the request-provenance and board-membership checks.
//
// Like the rest of worker/, these are the failures no other command catches: a
// save that succeeds is still a repo commit, so "any signed-in Cloudflare user
// can POST it" or "a foreign page can POST it" would pass `npm test`, `build`,
// `check` and `check:dist` untouched.
//
// verifyAccessJwt is not tested here — it needs a live JWKS endpoint and a real
// signed token. worker/README.md records the manual curl matrix for it.

import test from "node:test";
import assert from "node:assert/strict";

import { crossOriginRefusal, boardMember, whoami } from "./access.js";

const post = (headers = {}) =>
  new Request("https://yunited.ch/admin/api/save", { method: "POST", headers });
const reqUrl = new URL("https://yunited.ch/admin/api/save");

const get = (headers = {}) => new Request("https://yunited.ch/admin/api/whoami", { headers });

test("whoami: returns the verified JWT email", () => {
  assert.deepEqual(
    whoami(get(), { ok: true, email: "board@hsg.ch" }),
    { ok: true, email: "board@hsg.ch" },
  );
});

test("whoami: falls back to the forwarded header when the payload has no email", () => {
  const req = get({ "Cf-Access-Authenticated-User-Email": "board@hsg.ch" });
  assert.deepEqual(whoami(req, { ok: true }), { ok: true, email: "board@hsg.ch" });
});

test("whoami: reports not-signed-in when token verification is skipped", () => {
  assert.deepEqual(whoami(get(), { ok: true, skipped: true }), { ok: false });
});

test("whoami: reports not-signed-in when verification failed", () => {
  assert.deepEqual(whoami(get(), { ok: false, reason: "no Access token" }), { ok: false });
});

test("crossOriginRefusal: allows a same-origin request", () => {
  assert.equal(crossOriginRefusal(post({ Origin: "https://yunited.ch" }), reqUrl), null);
});

test("crossOriginRefusal: allows a request with no Origin header", () => {
  assert.equal(crossOriginRefusal(post(), reqUrl), null);
});

test("crossOriginRefusal: refuses a foreign Origin", () => {
  const msg = crossOriginRefusal(post({ Origin: "https://evil.example" }), reqUrl);
  assert.match(msg, /another site/);
});

test("crossOriginRefusal: refuses a same-host Origin on a different scheme or port", () => {
  assert.ok(crossOriginRefusal(post({ Origin: "http://yunited.ch" }), reqUrl));
  assert.ok(crossOriginRefusal(post({ Origin: "https://yunited.ch:8443" }), reqUrl));
});

test("crossOriginRefusal: refuses a malformed Origin", () => {
  assert.ok(crossOriginRefusal(post({ Origin: "not an origin" }), reqUrl));
});

test("crossOriginRefusal: matches whatever hostname the request arrived on", () => {
  const localhost = new URL("http://localhost:8787/admin/api/save");
  assert.equal(crossOriginRefusal(post({ Origin: "http://localhost:8787" }), localhost), null);
});

const CF_ENV = { CF_API_TOKEN: "t", CF_ACCOUNT_ID: "a", CF_ACCESS_GROUP_ID: "g" };
const fakeGroup = (emails) => ({ read: async () => ({ emails }) });

test("boardMember: skips when Cloudflare is not configured", async () => {
  assert.deepEqual(await boardMember({}, "anyone@example.com"), { ok: true, skipped: true });
  assert.deepEqual(
    await boardMember({ CF_API_TOKEN: "t" }, "anyone@example.com"),
    { ok: true, skipped: true },
  );
});

test("boardMember: accepts a listed email, ignoring case and surrounding space", async () => {
  const group = fakeGroup(["board@hsg.ch", "chair@hsg.ch"]);
  assert.deepEqual(await boardMember(CF_ENV, "  Board@HSG.ch ", group), { ok: true });
});

test("boardMember: rejects an unlisted email", async () => {
  const group = fakeGroup(["board@hsg.ch"]);
  const result = await boardMember(CF_ENV, "intruder@example.com", group);
  assert.equal(result.ok, false);
  assert.match(result.reason, /not on the board access list/);
});

test("boardMember: rejects a missing or blank email", async () => {
  const group = fakeGroup(["board@hsg.ch"]);
  assert.equal((await boardMember(CF_ENV, null, group)).ok, false);
  assert.equal((await boardMember(CF_ENV, "   ", group)).ok, false);
});
