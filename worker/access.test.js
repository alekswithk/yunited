// Unit tests for the request-provenance and board-membership checks.
//
// Like the rest of worker/, these are the failures no other command catches: a
// save that succeeds is still a repo commit, so "any signed-in Cloudflare user
// can POST it" or "a foreign page can POST it" would pass `npm test`, `build`,
// `check` and `check:dist` untouched.
//
import test from "node:test";
import assert from "node:assert/strict";

import { crossOriginRefusal, boardMember, verifyAccessJwt, whoami } from "./access.js";

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

const ACCESS_ENV = {
  CF_ACCESS_TEAM_DOMAIN: "tests.cloudflareaccess.com",
  CF_ACCESS_AUD: "app-audience",
};
const NOW = Date.parse("2026-09-08T12:00:00Z");

const b64url = (value) =>
  Buffer.from(typeof value === "string" ? value : JSON.stringify(value))
    .toString("base64url");

async function jwtFixture() {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  jwk.kid = "test-key";
  jwk.alg = "RS256";
  jwk.use = "sig";

  const sign = async (overrides = {}, headerOverrides = {}) => {
    const header = b64url({ alg: "RS256", kid: "test-key", ...headerOverrides });
    const payload = b64url({
      iss: "https://tests.cloudflareaccess.com",
      aud: "app-audience",
      exp: Math.floor(NOW / 1000) + 300,
      email: "board@hsg.ch",
      ...overrides,
    });
    const input = `${header}.${payload}`;
    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      pair.privateKey,
      new TextEncoder().encode(input),
    );
    return `${input}.${Buffer.from(signature).toString("base64url")}`;
  };

  const fetchImpl = async (url) => {
    assert.equal(url, "https://tests.cloudflareaccess.com/cdn-cgi/access/certs");
    return Response.json({ keys: [jwk] });
  };
  return { sign, fetchImpl };
}

const accessRequest = (token) =>
  get(token ? { "Cf-Access-Jwt-Assertion": token } : {});

test("verifyAccessJwt skips only when Access verification is not configured", async () => {
  assert.deepEqual(await verifyAccessJwt(get(), {}), { ok: true, skipped: true });
  assert.match((await verifyAccessJwt(get(), ACCESS_ENV)).reason, /no Access token/);
});

test("verifyAccessJwt accepts a correctly signed token and returns its email", async () => {
  const { sign, fetchImpl } = await jwtFixture();
  const result = await verifyAccessJwt(accessRequest(await sign()), ACCESS_ENV, {
    fetchImpl,
    now: () => NOW,
  });
  assert.deepEqual(result, { ok: true, email: "board@hsg.ch" });
});

test("verifyAccessJwt rejects issuer, audience and expiry before trusting the token", async () => {
  const { sign, fetchImpl } = await jwtFixture();
  const deps = { fetchImpl, now: () => NOW };
  assert.match(
    (await verifyAccessJwt(accessRequest(await sign({ iss: "https://elsewhere.example" })), ACCESS_ENV, deps)).reason,
    /issued elsewhere/,
  );
  assert.match(
    (await verifyAccessJwt(accessRequest(await sign({ aud: ["another-app"] })), ACCESS_ENV, deps)).reason,
    /another application/,
  );
  assert.match(
    (await verifyAccessJwt(accessRequest(await sign({ exp: Math.floor(NOW / 1000) })), ACCESS_ENV, deps)).reason,
    /expired/,
  );
});

test("verifyAccessJwt rejects unknown keys and altered signatures", async () => {
  const { sign, fetchImpl } = await jwtFixture();
  const deps = { fetchImpl, now: () => NOW };
  assert.match(
    (await verifyAccessJwt(accessRequest(await sign({}, { kid: "missing" })), ACCESS_ENV, deps)).reason,
    /unknown Access signing key/,
  );

  const valid = await sign();
  const lastDot = valid.lastIndexOf(".");
  const firstSignatureChar = valid[lastDot + 1];
  const altered = `${valid.slice(0, lastDot + 1)}${firstSignatureChar === "A" ? "B" : "A"}${valid.slice(lastDot + 2)}`;
  assert.match(
    (await verifyAccessJwt(accessRequest(altered), ACCESS_ENV, deps)).reason,
    /bad Access token signature/,
  );
});

test("verifyAccessJwt rejects malformed and unreadable token shapes", async () => {
  assert.match((await verifyAccessJwt(accessRequest("one.two"), ACCESS_ENV)).reason, /malformed/);
  assert.match((await verifyAccessJwt(accessRequest("not-json.either.bad"), ACCESS_ENV)).reason, /unreadable/);
});
