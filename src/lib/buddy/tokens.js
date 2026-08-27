// Opaque capability tokens for the buddy feature.
//
// There is no login: a signup confirms its email through a `verify` link, and a
// matched pair reaches its page through a `pair` link. The token in each URL is
// the whole key — it is random, stored next to the row it unlocks, and looked up
// on use. It is never a signed/derived value, so there is nothing to forge.
//
// Web Crypto + btoa only, so this runs unchanged in the Worker (workerd) and in
// Node for `npm test`.

/**
 * A URL-safe random token. 24 bytes → 32 base64url chars, ~192 bits — far past
 * anything guessable, short enough to sit in an email link.
 * @param {number} [bytes]
 * @returns {string}
 */
export function randomToken(bytes = 24) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let binary = "";
  for (const b of buf) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Shape check for a token arriving from a URL, before it touches the database. */
export function isToken(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(value);
}

/**
 * Length-independent equality, for comparing a supplied token to a stored one.
 * The tokens are looked up by value so timing is not really exploitable here,
 * but constant-time compare is cheap and removes the question.
 * @param {string} a
 * @param {string} b
 */
export function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
