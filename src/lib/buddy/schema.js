// The shape of a buddy-system signup — the one bit of the buddy feature the
// board never sees before it lands, so it is validated server-side against this
// before a row is written (worker/buddy.js), exactly the way content saves are
// validated against src/lib/schema.js.
//
// Framework-free (zod is a plain library) and isomorphic: `normalizeSignup`
// coerces raw form strings the same way in the Worker and in the browser, so
// there is one definition of "what a valid signup is", not two that drift.
import { z } from "zod";

/** Dictionary codes, mirrored from src/i18n/config.js — a signup remembers the
 *  language its emails should go out in. */
export const LOCALES = ["en", "de", "hr", "bs", "sr"];
export const ROLES = ["buddy", "seeker"];
export const AUDIENCES = ["hsg", "exchange"];
export const STUDY_LEVELS = ["assessment", "bachelor", "master", "other"];

/** Buddies choose 1–3; the overflow step may go past it only if openToExtra. */
export const MAX_CAPACITY = 3;

export const signupSchema = z
  .object({
    role: z.enum(ROLES),
    name: z.string().min(1, "Please tell us your name.").max(120),
    email: z.email("Please enter a valid email address.").max(200),
    audience: z.enum(AUDIENCES),
    studyLevel: z.enum(STUDY_LEVELS).nullable().default(null),
    // Free text, shown to the match, never used for matching.
    languages: z.string().max(200).default(""),
    note: z.string().max(2000).default(""),
    // Buddy-only in the form; harmless defaults for a seeker.
    capacity: z.number().int().min(1).max(MAX_CAPACITY).default(1),
    openToExtra: z.boolean().default(false),
    // Self-declared — there is no membership database to check against.
    isMember: z.boolean().default(false),
    consent: z
      .boolean()
      .refine((v) => v === true, "We need your consent to share your details with your match."),
    locale: z.enum(LOCALES).default("en"),
  })
  .strict();

/** @typedef {z.infer<typeof signupSchema>} Signup */

const asBool = (v) =>
  v === true || v === "true" || v === "on" || v === "1" || v === "yes";

/**
 * Coerce a raw record of form values (all strings, plus absent checkboxes) into
 * the typed object `signupSchema` expects. Does no validation — that is the
 * schema's job — only shaping: trims text, lowercases the email, turns checkbox
 * presence into a boolean, parses the capacity number.
 *
 * @param {Record<string, unknown>} raw
 * @returns {Record<string, unknown>}
 */
export function normalizeSignup(raw = {}) {
  const str = (k) => (raw[k] == null ? "" : String(raw[k]).trim());
  const level = str("studyLevel").toLowerCase();
  const loc = str("locale").toLowerCase();
  const capRaw = str("capacity");

  return {
    role: str("role").toLowerCase(),
    name: str("name"),
    email: str("email").toLowerCase(),
    audience: str("audience").toLowerCase(),
    studyLevel: STUDY_LEVELS.includes(level) ? level : null,
    languages: str("languages"),
    note: str("note"),
    capacity: capRaw === "" ? 1 : Number(capRaw),
    openToExtra: asBool(raw.openToExtra),
    isMember: asBool(raw.isMember),
    consent: asBool(raw.consent),
    locale: LOCALES.includes(loc) ? loc : "en",
  };
}

/**
 * Parse a raw form record end to end.
 * @param {Record<string, unknown>} raw
 * @returns {import("zod").SafeParseReturnType<unknown, Signup>}
 */
export function parseSignup(raw) {
  return signupSchema.safeParse(normalizeSignup(raw));
}

/** The first problem, phrased for a person, as `{ field, message }` or null. */
export function firstSignupProblem(result) {
  if (result.success) return null;
  const issue = result.error.issues[0];
  return { field: String(issue.path[0] ?? ""), message: issue.message };
}
