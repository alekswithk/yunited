// The shape of the content the board edits by hand in content/*.json.
// These schemas ARE the documentation for that edit surface: they say which
// fields exist, which are required, and what a valid value looks like. They
// run at BUILD time (see content.js) so a typo or a missing field fails
// `npm run build` with a readable message instead of shipping a broken page.
//
// Keep this framework-free — zod is a plain library, not Astro-specific — and
// keep it in lockstep with content/events.json and content/members.json. A
// change here is a change to what the board is allowed to write.
import { z } from "zod";

// "2026-05-13" — an ISO date that is also a real day on the calendar. The
// regex alone would accept 2026-02-30, so we reconstruct the date and check
// the parts round-trip.
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be a date in YYYY-MM-DD form")
  .refine((s) => {
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return (
      dt.getUTCFullYear() === y &&
      dt.getUTCMonth() === m - 1 &&
      dt.getUTCDate() === d
    );
  }, "is not a real calendar date");

// "20:30" — 24-hour HH:MM.
const time24 = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must be a 24-hour time in HH:MM form");

// A content-relative image path like "images/events/25_26/x.webp". The file
// must actually exist under src/ — resolveImage() enforces that separately at
// render time — so here we only rule out absolute paths and URLs.
const imagePath = z
  .string()
  .min(1)
  .refine(
    (s) => !s.startsWith("/") && !/^https?:\/\//.test(s),
    "must be a path relative to src/, e.g. images/events/25_26/x.webp"
  );

// An optional field. A hand-edit leaves it `null`; the CMS writes "" (or omits
// it) when the editor leaves it blank. Normalize all of those to null before
// checking the value's real format, so both edit paths validate identically.
const optional = (schema) =>
  z.preprocess((v) => (v === "" || v === undefined ? null : v), schema.nullable());

// .strict() so a misspelled key ("titel", "rsvp") is caught instead of being
// silently ignored — the whole point of validating hand-edited JSON.
export const eventSchema = z
  .object({
    id: z.string().min(1, "is required"),
    title: z.string().min(1, "is required"),
    // null / blank / omitted date means "TBA" and renders as an upcoming card.
    date: optional(isoDate),
    time: optional(time24),
    location: z.string().min(1, "is required"),
    description: z.string().min(1, "is required"),
    image: imagePath,
    rsvpUrl: optional(z.string().url("must be a full URL")),
  })
  .strict();

// A board seat. The name may be blank or a "[PLACEHOLDER]" while a role is
// filled but the person isn't announced yet — members.js treats that as "To be
// announced" — so name is intentionally not required. The role is the news.
// `order` sets the display sequence (lowest = the large lead card); it replaces
// the old "first entry wins" rule now that each member is its own file.
export const memberSchema = z
  .object({
    name: z.string(),
    role: z.string().min(1, "is required"),
    photo: optional(imagePath),
    bio: z.string(),
    order: z.number().int().positive("must be a positive whole number"),
  })
  .strict();
