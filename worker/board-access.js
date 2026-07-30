// The board's own allow-list, editable from /admin.
//
// READ worker/access.js FIRST. That module decides whether the person making
// this request is allowed in at all, and the rule there — "there is no login
// code in this project and there should never be one" — still holds. This file
// does not authenticate anybody. It edits the *membership list* that Cloudflare
// Access consults when it authenticates somebody, which is a different thing:
// after a change here, the new person still has to prove they own that mailbox
// through Access's own login before they get anywhere.
//
// WHY IT EXISTS. Adding a board member used to be the one board task that could
// not be done from /admin: it needed the Cloudflare dashboard, which in practice
// meant one person, at every handover, forever. Now the list lives in a Zero
// Trust *rule group* named by CF_ACCESS_GROUP_ID, the /admin application's policy
// includes that group instead of a literal list of emails, and this module
// rewrites the group's email rules.
//
// WHAT THE CLOUDFLARE API MAKES US DO. There is no PATCH, no append, and no
// ETag/If-Match on the control-plane API, so:
//
//   * every change is read-modify-write, and
//   * PUT replaces the WHOLE group. `name` is required (omit it and the group is
//     renamed to nothing); omitting `exclude`/`require` clears them. So `write()`
//     takes the object `read()` returned and changes only the email rules inside
//     `include`. Non-email include rules — a nested group, an email_domain rule —
//     are somebody's deliberate configuration and are passed through untouched.
//
// That also means two people editing at once could silently drop each other's
// change, and a dropped addition here is a person who cannot sign in. There is no
// server-side compare-and-swap to lean on, so the panel sends back the list it
// was actually showing and `conflict()` refuses the write if the group has moved
// underneath it. See postAccess in index.js.

import { z } from "zod";

const API = "https://api.cloudflare.com/client/v4";

const EMAIL = z.email();

/**
 * @param {{ CF_API_TOKEN: string, CF_ACCOUNT_ID: string, CF_ACCESS_GROUP_ID: string }} env
 */
export function accessGroup(env) {
  const path = `/accounts/${env.CF_ACCOUNT_ID}/access/groups/${env.CF_ACCESS_GROUP_ID}`;

  /**
   * One Cloudflare API call.
   *
   * Note the two-part failure check. Unlike GitHub, Cloudflare wraps every
   * answer in `{ success, errors, result }` and can return `200` with
   * `success: false` — so `response.ok` on its own would let a rejected write
   * through as if it had applied.
   */
  async function api(init = {}) {
    const response = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${env.CF_API_TOKEN}`,
        Accept: "application/json",
        "User-Agent": "yunited-admin",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
    });

    const text = await response.text();
    /** @type {{ success?: boolean, errors?: {message?: string}[], result?: any } | null} */
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      // Not JSON — the truncated body is the best detail available.
    }

    if (!response.ok || body?.success === false) {
      const detail = body?.errors?.[0]?.message ?? text.slice(0, 300);
      const error = new Error(`Cloudflare ${response.status} on ${path}: ${detail}`);
      // @ts-expect-error — the status and the service, so the catch in index.js
      // can phrase a rejected token or a rate limit as the right instruction.
      // Without `service` it would blame GitHub for a Cloudflare failure.
      error.status = response.status;
      // @ts-expect-error — see above.
      error.service = "cloudflare";
      throw error;
    }

    return body?.result ?? null;
  }

  return {
    /**
     * The current list, plus the raw group.
     *
     * The group object is not a debugging convenience: `write()` needs it to
     * echo back the fields a PUT would otherwise destroy.
     */
    async read() {
      const group = await api();
      return { group, emails: emailsFromRules(group?.include) };
    },

    /**
     * Replace the group's email rules with `emails`, leaving everything else as
     * it was. Returns the emails Cloudflare confirms are in the saved group,
     * never the ones we hoped it would save.
     */
    async write(group, emails) {
      const saved = await api({ method: "PUT", body: JSON.stringify(writeBody(group, emails)) });
      return emailsFromRules(saved?.include);
    },
  };
}

/**
 * The body of the PUT.
 *
 * Every key here is present because leaving it out is destructive, not because
 * the API asks for it: `name` would be blanked, `exclude` and `require` would be
 * cleared, and any include rule that is not an email — a nested group, a whole
 * allowed domain — would disappear. `include` is therefore the non-email rules
 * kept in their original order, followed by ours.
 */
export function writeBody(group, emails) {
  const { others } = partitionRules(group?.include);
  return {
    name: group?.name ?? "",
    include: [...others, ...rulesFromEmails(emails)],
    exclude: group?.exclude ?? [],
    require: group?.require ?? [],
    is_default: group?.is_default ?? false,
  };
}

/** Split an `include` array into the email addresses and everything else. */
export function partitionRules(include) {
  const emails = [];
  const others = [];
  for (const rule of Array.isArray(include) ? include : []) {
    const email = rule?.email?.email;
    if (typeof email === "string" && email.trim() !== "") emails.push(email);
    else others.push(rule);
  }
  return { emails: normalizeEmails(emails), others };
}

/** Just the addresses from an `include` array. */
export function emailsFromRules(include) {
  return partitionRules(include).emails;
}

/** The rule shape Cloudflare documents for a single address, in one place only. */
export function rulesFromEmails(emails) {
  return normalizeEmails(emails).map((email) => ({ email: { email } }));
}

/**
 * One canonical form for a list of addresses.
 *
 * Used on the way in AND on the way out, so that comparing "what the browser was
 * shown" with "what Cloudflare has" compares like with like — otherwise a
 * difference in capitalisation reads as somebody else's concurrent edit and the
 * save is refused for no reason. Order is preserved because the panel shows the
 * list in the group's own order.
 */
export function normalizeEmails(raw) {
  const seen = new Set();
  const out = [];
  for (const value of Array.isArray(raw) ? raw : []) {
    if (typeof value !== "string") continue;
    const email = value.trim().toLowerCase();
    if (email === "" || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

/**
 * Is this a usable email address? Returns null when it is, or a sentence when it
 * is not.
 *
 * Zod is already a dependency of this Worker (the collections registry validates
 * with the site's real schemas), so this is its email rule rather than a
 * hand-rolled regex that would be wrong in some interesting way.
 */
export function validateEmail(value) {
  const email = typeof value === "string" ? value.trim() : "";
  if (email === "") return "Type the email address you want to add.";
  if (!EMAIL.safeParse(email).success) {
    return `“${email}” doesn't look like an email address.`;
  }
  return null;
}

/**
 * The three things this endpoint refuses to do. Returns null to allow the
 * change, or the sentence the board should read.
 *
 * All three are lockout protection, and they are here rather than in the browser
 * because the browser is where they are easiest to skip. The panel greys out the
 * same buttons, but this is what enforces it.
 *
 * NOT guarded: adding anyone at all. Any board member can add any address —
 * that is the deliberate trade-off of putting this in the panel at all, and the
 * reason every change is logged with the email of whoever made it.
 */
export function guardChange({ current, next, actor }) {
  const before = normalizeEmails(current);
  const after = normalizeEmails(next);

  if (after.length === 0) {
    return (
      "That would leave nobody able to sign in to this page, so it wasn't saved. " +
      "Add the replacement address first, then remove the old one."
    );
  }

  const me = typeof actor === "string" ? actor.trim().toLowerCase() : "";
  if (me !== "" && before.includes(me) && !after.includes(me)) {
    return (
      `That would remove your own address (${me}) and lock you out of this page, ` +
      "so it wasn't saved. Ask someone else on the list to remove you."
    );
  }

  return null;
}

/**
 * Has the group changed since the panel last looked?
 *
 * The panel sends the list it was showing; this compares it to what Cloudflare
 * has right now. It is not a true compare-and-swap — the API offers none, so a
 * write can still land in the moment between the read and the PUT — but it
 * catches the case that actually happens, which is two people with the page open
 * a few minutes apart. Silently merging instead would be worse: the merge that
 * looks harmless is the one that resurrects an address somebody just removed.
 */
export function conflict(expected, current) {
  if (expected === undefined || expected === null) return false;
  const a = normalizeEmails(expected);
  const b = normalizeEmails(current);
  return a.length !== b.length || a.some((email, i) => email !== b[i]);
}

/** What changed, for the log line. Cloudflare's own logs only name the token. */
export function describeChange(before, after) {
  const a = normalizeEmails(before);
  const b = normalizeEmails(after);
  const added = b.filter((email) => !a.includes(email));
  const removed = a.filter((email) => !b.includes(email));
  return [
    added.length ? `added ${added.join(", ")}` : null,
    removed.length ? `removed ${removed.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("; ") || "no change";
}
