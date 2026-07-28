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
// This module does two separate things, and it is worth keeping them apart:
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
