// Who is making this request, according to Cloudflare Access.
//
// READ THIS BEFORE CHANGING ANYTHING HERE.
//
// There is no login code in this project and there should never be one. Access
// (Zero Trust → Access → Applications) sits in front of yunited.ch/admin and
// decides who gets through, from an email allow-list a human maintains in the
// Cloudflare dashboard. Adding or removing a board member is an edit to that
// list — no code change, no deploy, no GitHub account.
//
// This module does four things, and it is worth keeping them apart:
//
//   1. `identity()` reads the email Access forwards, purely so the panel can
//      say "Signed in as …". It grants nothing.
//
//   2. `verifyAccessJwt()` re-checks the signed token Access issues, and IS
//      TURNED ON (CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD are set in
//      wrangler.jsonc). This is what makes the endpoint safe by its own
//      authority rather than by where it happens to sit.
//
//      The distinction is not theoretical. Access is attached to the HOSTNAME
//      yunited.ch, so it fronted yunited.ch/admin — and nothing else. The same
//      Worker was also answering on yunited.<subdomain>.workers.dev with no
//      Access anywhere near it, which would have left /admin/api/save writable
//      by anyone who guessed the URL. That hostname is now switched off in
//      wrangler.jsonc as well; this check is the half that keeps holding if the
//      routing is ever changed back, or the application's path scope narrowed.
//
//      With the two values unset the check skips itself with a warning, which
//      is how it behaved before they were filled in. Don't rely on that.
//
//   3. `crossOriginRefusal()` rejects a state-changing request whose `Origin`
//      is another site. `verifyAccessJwt()` proves Access issued the token, not
//      that our own page made the request: Access attaches the JWT to a forged
//      cross-site form POST just the same, because the CF_Authorization cookie
//      rides along and `multipart/form-data` needs no CORS preflight. `Origin`
//      is the one part of that request the browser sets and script cannot.
//
//   4. `boardMember()` checks the caller is on the `yunited-board` allow-list.
//      The Access JWT carries no group claim, so "Access let this through" only
//      means the caller passed *some* policy on the /admin application. Board
//      membership was implied by that policy including the board rule group and
//      never checked here. It is now, on the write routes — see index.js
//      `handle()`. (`GET state` is exempt: loading the panel must not depend on
//      a second service. Access is still the door in front of it.)
//
// Callers 3 and 4 are wired in `handle()` for every POST. Narrowing the Access
// application's path scope so it no longer fronts `/admin/api/*` still needs a
// matching code change — these checks are defence in depth, not the door.

import { accessGroup } from "./board-access.js";

const ACCESS_EMAIL_HEADER = "Cf-Access-Authenticated-User-Email";
const ACCESS_JWT_HEADER = "Cf-Access-Jwt-Assertion";

/**
 * The signed-in board member, as far as we can tell.
 *
 * Never used for authorization — only for the "Signed in as" line in the corner
 * of the panel. If the header is missing (running locally, say) the panel just
 * doesn't show a name.
 *
 * @param {Request} request
 * @returns {{ email: string | null }}
 */
export function identity(request) {
  return { email: request.headers.get(ACCESS_EMAIL_HEADER) };
}

/**
 * Who is signed in, for a public page deciding whether to reveal its board-only
 * "Edit" links.
 *
 * Grants nothing. The write routes are gated in handle() (Origin + board
 * membership); this only says whether the affordances appear. It returns the
 * verified email — the JWT payload, not the spoofable header — and { ok: false }
 * when token verification is skipped, so a deployment with CF_ACCESS_AUD unset
 * does not advertise the editor to every visitor.
 *
 * @param {Request} request
 * @param {{ ok: boolean, skipped?: boolean, email?: string }} verified  a verifyAccessJwt result
 * @returns {{ ok: true, email: string | null } | { ok: false }}
 */
export function whoami(request, verified) {
  if (!verified.ok || verified.skipped) return { ok: false };
  return { ok: true, email: verified.email ?? identity(request).email };
}

// The JWKS is fetched once and reused. Access rotates its signing keys and
// publishes the previous one for seven days after, so a cached set stays valid
// well past this TTL; an hour simply bounds how long a rotation takes to be
// picked up by a long-lived isolate.
let jwksCache = { url: "", keys: null, fetchedAt: 0 };
const JWKS_TTL_MS = 60 * 60 * 1000;

/**
 * Verify the Access JWT on this request.
 *
 * @param {Request} request
 * @param {{ CF_ACCESS_TEAM_DOMAIN?: string, CF_ACCESS_AUD?: string }} env
 * @returns {Promise<{ ok: true, skipped?: boolean, email?: string } | { ok: false, reason: string }>}
 */
export async function verifyAccessJwt(request, env) {
  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN;
  const aud = env.CF_ACCESS_AUD;

  if (!teamDomain || !aud) {
    console.warn(
      "[admin] CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD are not set, so the Access " +
        "token is not being verified. Access still gates /admin, but see " +
        "worker/README.md — setting these two closes the gap if the app's path " +
        "scope is ever changed.",
    );
    return { ok: true, skipped: true };
  }

  const token = request.headers.get(ACCESS_JWT_HEADER);
  if (!token) {
    // `local` only changes the wording of the error. It is NOT a way in: a
    // request without a token is refused either way, whatever hostname it
    // claims. Anything else would make a spoofable Host header into a bypass.
    const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(request.url).hostname);
    return { ok: false, reason: "no Access token on the request", local };
  }

  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed Access token" };
  const [headerB64, payloadB64, signatureB64] = parts;

  let header;
  let payload;
  try {
    header = JSON.parse(decodeSegment(headerB64));
    payload = JSON.parse(decodeSegment(payloadB64));
  } catch {
    return { ok: false, reason: "unreadable Access token" };
  }

  // The issuer is the team's own hostname; anything else is a token minted for
  // somebody else's Zero Trust account.
  const issuer = `https://${teamDomain.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  if (payload.iss !== issuer) return { ok: false, reason: "Access token issued elsewhere" };

  // `aud` is per-application, so a token from a DIFFERENT app on the same team
  // (some other tool behind the same Access account) is rejected here.
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(aud)) return { ok: false, reason: "Access token is for another application" };

  if (typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now()) {
    return { ok: false, reason: "Access token has expired — reload the page" };
  }

  const key = await signingKey(issuer, header.kid);
  if (!key) return { ok: false, reason: "unknown Access signing key" };

  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64UrlToBytes(signatureB64),
    new TextEncoder().encode(`${headerB64}.${payloadB64}`),
  );
  if (!valid) return { ok: false, reason: "bad Access token signature" };

  return { ok: true, email: payload.email };
}

/** Fetch (and cache) the team's public signing keys, then import the one named by `kid`. */
async function signingKey(issuer, kid) {
  const url = `${issuer}/cdn-cgi/access/certs`;
  const stale = jwksCache.url !== url || Date.now() - jwksCache.fetchedAt > JWKS_TTL_MS;

  if (stale || !jwksCache.keys) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not fetch Access signing keys (${response.status})`);
    const { keys } = await response.json();
    jwksCache = { url, keys, fetchedAt: Date.now() };
  }

  const jwk = (jwksCache.keys ?? []).find((k) => k.kid === kid);
  if (!jwk) return null;

  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

/** base64url -> bytes. JWT segments drop the padding and swap two characters. */
function base64UrlToBytes(segment) {
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    segment.length + ((4 - (segment.length % 4)) % 4),
    "=",
  );
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeSegment(segment) {
  return new TextDecoder().decode(base64UrlToBytes(segment));
}

/**
 * Refuse a request that came from another site.
 *
 * Returns null to allow, or a sentence to refuse with a 403. Only ever consulted
 * for state-changing requests (`handle()` calls it for every POST).
 *
 * A request with no `Origin` header at all is allowed: `Origin` is evidence only
 * when it is present and points elsewhere. Same-origin `fetch` from our own page
 * always sends it; a curl or a health check may not, and neither is a CSRF
 * vector. `wrangler dev` serves the page and the API from one localhost origin,
 * so this only diverges under a genuine cross-site request.
 *
 * @param {Request} request
 * @param {URL} url  the parsed request URL (so the check works on any hostname)
 * @returns {string | null}
 */
export function crossOriginRefusal(request, url) {
  const origin = request.headers.get("Origin");
  if (!origin) return null;

  let originUrl;
  try {
    originUrl = new URL(origin);
  } catch {
    return "This request's Origin header is not a valid origin, so it was refused.";
  }

  if (originUrl.origin === url.origin) return null;
  return "This request came from another site, so it was refused.";
}

// The board allow-list, cached per isolate.
//
// `boardMember()` reads it via board-access.js — the same list `/admin`'s Access
// tab edits. One Cloudflare API call, so it is cached for a minute: long enough
// that a burst of saves costs one call, short enough that removing someone takes
// effect while they are still deciding what to break. Access's own login is the
// real-time boundary; this is the check behind it.
let boardCache = { emails: /** @type {string[] | null} */ (null), at: 0 };
const BOARD_TTL_MS = 60 * 1000;

const normEmail = (value) => (typeof value === "string" ? value.trim().toLowerCase() : "");

async function cachedBoardEmails(env) {
  if (!boardCache.emails || Date.now() - boardCache.at >= BOARD_TTL_MS) {
    const { emails } = await accessGroup(env).read();
    boardCache = { emails: emails.map(normEmail), at: Date.now() };
  }
  return boardCache.emails;
}

/**
 * Is `email` on the `yunited-board` allow-list?
 *
 *   { ok: true }                 — yes
 *   { ok: true, skipped: true }  — this deployment cannot check (no CF_API_TOKEN
 *                                  / CF_ACCOUNT_ID / CF_ACCESS_GROUP_ID); it
 *                                  relies on the Access policy alone, as before
 *   { ok: false, reason }        — not on the list, or no verified email
 *
 * A thrown Cloudflare error (bad token, rate limit) propagates to the catch in
 * index.js, which already phrases those. Failing a save closed when the list is
 * unreadable is the right call for a mutating route.
 *
 * @param {Record<string, string>} env
 * @param {string | null | undefined} email  the VERIFIED email (jwt payload), not the header
 * @param {{ read: () => Promise<{ emails: string[] }> }} [group]  injectable for tests; bypasses the cache
 * @returns {Promise<{ ok: true, skipped?: boolean } | { ok: false, reason: string }>}
 */
export async function boardMember(env, email, group = null) {
  if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID || !env.CF_ACCESS_GROUP_ID) {
    return { ok: true, skipped: true };
  }

  const who = normEmail(email);
  if (!who) return { ok: false, reason: "no verified email on the request" };

  const emails = group ? (await group.read()).emails.map(normEmail) : await cachedBoardEmails(env);
  return emails.includes(who)
    ? { ok: true }
    : { ok: false, reason: `${who} is not on the board access list` };
}
