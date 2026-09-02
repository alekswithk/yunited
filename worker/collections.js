// What the board can edit, described once.
//
// This registry is the ONLY description of the admin form. The Worker serves it
// to the browser (GET /admin/api/state) and the page renders whatever it is
// given, so there is no second copy of the field list in the front end that
// could drift from this one. The old Sveltia config.yml was exactly that second
// copy — a YAML file that had to be kept "in sync with src/lib/schema.js" by
// hand, and periodically wasn't.
//
// Validation is not described here at all. Each collection points at the actual
// Zod schema from src/lib/schema.js, the same object the site build validates
// with, so "what /admin accepts" and "what the build accepts" cannot disagree.
// Anything the Worker saves is therefore guaranteed to build.
//
// A field entry means:
//   name        the JSON key, and the schema key it must match
//   label       shown above the input
//   type        how to render it AND how to coerce it (see coerceField)
//   required    whether the board must fill it in; mirrors the schema
//   emptyValue  what a blank input becomes — "" or null. NOT cosmetic:
//               memberSchema types `name`/`bio` as plain strings, which accept
//               "" and reject null. Read the note on coerceField in lib.js.
//   help        one line of plain-language guidance, shown under the input
import { eventSchema, memberSchema, partnerSchema } from "../src/lib/schema.js";
import { TARGETS, TRANSLATABLE } from "../src/lib/translate/content.js";
import { LANGUAGES } from "../src/lib/translate/glossary.js";
import { IMAGE_EXTENSIONS, academicYear, eventSlug, slugify } from "./lib.js";

/** @typedef {{ name: string, label: string, type: string, required: boolean, emptyValue: ""|null, help?: string, placeholder?: string, min?: number }} Field */

export const COLLECTIONS = {
  events: {
    label: "Events",
    singular: "event",
    dir: "content/events",
    schema: eventSchema,

    // Which JSON key holds the photo, and where an upload is filed. `imageDir`
    // is relative to src/ because that is what the JSON stores (CLAUDE.md).
    imageField: "image",
    imageLabel: "Photo",
    imageHelp:
      "A landscape (wide) photo — it's cropped to a wide strip at the top of the card. " +
      "JPG, PNG or WebP, ideally under 1 MB. Photos straight from an iPhone are often " +
      "HEIC, which won't work; share or export them first and they save as JPEG.",
    imageDir: (data, now) => `images/events/${academicYear(data.date, now)}`,

    // The filename for a NEW entry. Existing entries keep the filename they
    // were created with — see `slugFor` in index.js for why.
    slugFor: (data, now) => eventSlug(data.title, data.date, now),

    // Machine-written, and carried through every save: an editor that commits
    // back only the fields it knows about would strip every translation.
    //
    // NO LONGER "written by the CLI and by nothing else" — /admin fills it on
    // save now, and the Translations page lets the board correct a rendering by
    // hand. What is still true, and load-bearing, is that the FORM never
    // authors sourceLang or sourceHash: those are the Worker's bookkeeping, and
    // a submitted one is ignored.
    carry: ["id", "i18n"],

    // The per-event Translations page. Declared here, in the same registry as
    // the fields, so the panel renders it from what the Worker sent rather than
    // from a second list of locales in the browser — the drift that made
    // Sveltia's config.yml worth deleting.
    //
    // `fields` must name real fields and `locales` real dictionaries;
    // collections.test.js asserts both, because a typo here would render an
    // input whose contents the schema then rejects at save time.
    translations: {
      fields: TRANSLATABLE.events,
      locales: TARGETS.map((code) => ({ code, label: LANGUAGES[code].name })),
    },

    // How the board can order the list. The first entry is the default.
    //
    // Sorting happens in the browser — the whole collection is already there,
    // so re-ordering is instant and costs no round trip. These are declared as
    // DATA rather than as comparator functions so they can be sent to the page
    // with the field definitions; admin.js has one generic comparator that
    // reads them. See sortEntries there.
    //
    // `nullsAre: "latest"` on date: an event with no date yet is one that has
    // been announced but not scheduled, so it belongs with the future, not
    // before events from last year. That puts it at the top of "newest first"
    // and at the bottom of "oldest first", which is right in both directions.
    sorts: [
      { key: "date-desc", label: "Date — newest first", field: "date", type: "date", dir: "desc", nullsAre: "latest" },
      { key: "date-asc", label: "Date — oldest first", field: "date", type: "date", dir: "asc", nullsAre: "latest" },
      { key: "title", label: "Title — A to Z", field: "title", type: "text", dir: "asc" },
    ],

    /** @type {Field[]} */
    fields: [
      {
        name: "title",
        label: "Title",
        type: "string",
        required: true,
        emptyValue: "",
        placeholder: "Casino Night",
        help: "The name of the event, as it should appear on the card.",
      },
      {
        name: "description",
        label: "Description",
        type: "text",
        required: true,
        emptyValue: "",
        help: "A sentence or three: what it is, who it's for, anything people need to bring or know.",
      },
      {
        name: "date",
        label: "Date",
        type: "date",
        required: false,
        emptyValue: null,
        help: "Leave empty if it isn't fixed yet — the event then shows as “date to be announced” at the top of Upcoming. Never mark an event as past by hand; the site does that from this date.",
      },
      {
        name: "time",
        label: "Start time",
        type: "time",
        required: false,
        emptyValue: null,
        placeholder: "20:30",
        help: "24-hour, e.g. 20:30. Leave empty if there's no fixed start.",
      },
      {
        name: "location",
        label: "Location",
        type: "string",
        required: false,
        emptyValue: null,
        placeholder: "Déjà Vu Bar, St. Gallen",
        help: "Venue name or address. Leave empty if it isn't decided — the line is simply left off the card. This is never translated, so write it as it appears on the door.",
      },
      {
        name: "rsvpUrl",
        label: "RSVP / ticket link",
        type: "url",
        required: false,
        emptyValue: null,
        placeholder: "https://uniclubs.ch/...",
        help: "Paste the whole link, starting with https://. Leave empty and the card shows no button.",
      },
      {
        name: "mapCoords",
        label: "Map coordinates",
        type: "string",
        required: false,
        emptyValue: null,
        placeholder: "47.4245, 9.3767",
        help:
          "Optional. On openstreetmap.org, right-click the venue and choose “Show address”, then copy the " +
          "“latitude, longitude” pair it shows. This drops a mini-map into the card when someone expands it. " +
          "Leave empty and the card just shows the venue name and a directions link.",
      },
    ],
  },

  members: {
    label: "Board members",
    singular: "board member",
    dir: "content/members",
    schema: memberSchema,

    imageField: "photo",
    imageLabel: "Portrait",
    imageHelp:
      "Optional. A square-ish head-and-shoulders photo works best — it's shown as a portrait. " +
      "JPG, PNG or WebP, ideally under 1 MB. Without one, the card shows their initial instead.",
    imageDir: () => "images/members",
    slugFor: (data) => slugify(data.role),
    // Board members are never translated and have no i18n block — deliberately,
    // see memberSchema. There is nothing to carry but the filename identity.
    carry: [],

    // Default matches the page: lowest `order` first, so the list on screen is
    // the board in the order visitors see it. See the note on events' sorts.
    sorts: [
      { key: "order", label: "Board order — 1 first", field: "order", type: "number", dir: "asc" },
      { key: "role", label: "Role — A to Z", field: "role", type: "text", dir: "asc" },
      { key: "name", label: "Name — A to Z", field: "name", type: "text", dir: "asc" },
    ],

    /** @type {Field[]} */
    fields: [
      {
        name: "role",
        label: "Role",
        type: "string",
        required: true,
        emptyValue: "",
        placeholder: "Head of Events",
        help: "Roles are used in English at HSG, so write it in English. This is the one field a seat can't be without.",
      },
      {
        name: "name",
        label: "Name",
        type: "string",
        required: false,
        emptyValue: "",
        placeholder: "Anastasija Veličković",
        help: "Leave empty if the seat is filled but not announced yet — it shows as “To be announced”.",
      },
      {
        name: "order",
        label: "Order",
        type: "number",
        required: true,
        emptyValue: null,
        min: 1,
        help: "1 is the President and gets the large card, then 2, 3, … Every member needs a different number.",
      },
      {
        name: "bio",
        label: "Short bio",
        type: "text",
        required: false,
        emptyValue: "",
        help: "A line or two in their own words. Shown exactly as written on every language's page — it is never machine-translated.",
      },
    ],
  },

  partners: {
    label: "Partners",
    singular: "partner",
    dir: "content/partners",
    schema: partnerSchema,

    imageField: "logo",
    imageLabel: "Logo",
    imageHelp:
      "Optional. Their logo, ideally on a transparent or white background. " +
      "PNG or WebP, under 1 MB. Without one, the strip shows their name as text.",
    imageDir: () => "images/partners",
    slugFor: (data) => slugify(data.name),
    carry: [],

    sorts: [
      { key: "order", label: "Display order — 1 first", field: "order", type: "number", dir: "asc" },
      { key: "name", label: "Name — A to Z", field: "name", type: "text", dir: "asc" },
    ],

    /** @type {Field[]} */
    fields: [
      {
        name: "name",
        label: "Name",
        type: "string",
        required: true,
        emptyValue: "",
        placeholder: "Some Company AG",
        help: "The company or organisation, as they write it themselves.",
      },
      {
        name: "order",
        label: "Order",
        type: "number",
        required: true,
        emptyValue: null,
        min: 1,
        help: "1 shows first in the logo strip. Every partner needs a different number.",
      },
      {
        name: "url",
        label: "Website",
        type: "url",
        required: false,
        emptyValue: null,
        placeholder: "https://example.com",
        help: "Paste the whole link, starting with https://. Optional — the logo just won't link anywhere.",
      },
    ],
  },
};

/**
 * Does this collection's schema demand a photo?
 *
 * Asked OF THE SCHEMA rather than declared here a second time. An event's
 * `image` is required and a member's `photo` is not, and that decision belongs
 * to src/lib/schema.js alone — it is the file CLAUDE.md calls the authoritative
 * description of the board's edit surface. Probing it with an entry that is
 * valid apart from a missing image means this answer cannot drift from what the
 * build will actually accept: make `image` optional in the schema tomorrow and
 * the form stops demanding one, with nothing else to remember to change.
 *
 * @param {typeof COLLECTIONS[keyof typeof COLLECTIONS]} collection
 */
export function isImageRequired(collection) {
  const probe = { [collection.imageField]: null };
  for (const field of collection.fields) {
    probe[field.name] = field.type === "number" ? 1 : field.required ? "x" : field.emptyValue;
  }
  const result = collection.schema.safeParse(probe);
  return (
    !result.success &&
    result.error.issues.some((issue) => issue.path[0] === collection.imageField)
  );
}

/**
 * The subset of the registry the browser needs: labels, fields, help text. It
 * deliberately does NOT include the Zod schemas or the path/slug functions —
 * those are server-side concerns, and shipping them would invite the front end
 * to start making decisions the Worker is supposed to make. The page renders
 * this and nothing else, so the form cannot describe a field the Worker does
 * not know about.
 */
export function publicShape() {
  return Object.entries(COLLECTIONS).map(([name, c]) => ({
    name,
    label: c.label,
    singular: c.singular,
    fields: c.fields,
    sorts: c.sorts,
    // Absent for collections that are never translated, which is what the page
    // keys off to leave the Content/Translations switch out entirely.
    translations: c.translations ?? null,
    image: {
      field: c.imageField,
      label: c.imageLabel,
      help: c.imageHelp,
      required: isImageRequired(c),
      accept: IMAGE_ACCEPT,
      maxBytes: MAX_IMAGE_BYTES,
    },
  }));
}

// Shared with the Worker so the browser's file picker offers exactly what the
// server will accept — one list, not two.
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_ACCEPT = IMAGE_EXTENSIONS.map((ext) => `.${ext}`).join(",");
