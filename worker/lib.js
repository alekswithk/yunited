// Pure helpers for the admin Worker — no network, no Workers globals, nothing
// that needs a request to exercise. They live apart from index.js precisely so
// `npm test` can run them under plain Node (see lib.test.js).
//
// Everything here decides something the board never sees and no build can
// catch: which file an entry lands in, which folder its photo goes to, whether
// a blank input becomes "" or null. Get one wrong and the commit still
// succeeds — it just writes the wrong path, or a value the schema rejects on
// the next build. That is the same "green everywhere, broken in production"
// shape that src/lib/events.js is tested for, and it is why these are tested
// too.

// Latin letters used across the region that ASCII-fold to something readable in
// a filename. Slugs are internal, but they are also the filenames a maintainer
// reads in `git log`, so "prvi-maj" beats "prvi-maj" losing its j to a stray
// combining mark.
const FOLD = {
  č: "c", ć: "c", đ: "d", š: "s", ž: "z",
  ä: "a", ö: "o", ü: "u", ß: "ss",
  á: "a", à: "a", â: "a", é: "e", è: "e", ê: "e",
  í: "i", ì: "i", ó: "o", ò: "o", ô: "o", ú: "u", ù: "u", ñ: "n", ç: "c",
};

/**
 * "Meet & Greet" -> "meet-and-greet". Lowercase, ASCII, dashes.
 *
 * "&" becomes "and" rather than being dropped, because the alternative reads as
 * a typo: the club's own "Meet & Greet" would otherwise file itself as
 * "meet-greet".
 *
 * @param {string} input
 * @returns {string}
 */
export function slugify(input) {
  return String(input ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[čćđšžäöüßáàâéèêíìóòôúùñç]/g, (c) => FOLD[c] ?? c)
    // Decompose anything else accented and drop the marks, so a character we
    // did not list above still degrades to its base letter instead of vanishing.
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The academic-year folder an event's photo belongs in: "25_26", "26_27".
 *
 * This mirrors the convention already in src/images/events/ — the 2025/26
 * season's photos sit in 25_26 whether they were shot in November or May. The
 * year rolls over in August, which is when HSG's autumn semester and the club's
 * own programme start.
 *
 * A TBA event (no date) falls back to today's academic year. Nothing depends on
 * getting that right — the folder is filing, not meaning; the path stored in the
 * JSON is what resolves the image — so a TBA event created in July that turns
 * out to belong to the next season is untidy, not broken.
 *
 * @param {string | null | undefined} isoDate  "YYYY-MM-DD" or null for TBA
 * @param {Date} [now]  injected so the tests do not rot
 * @returns {string}
 */
export function academicYear(isoDate, now = new Date()) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(String(isoDate ?? ""))
    ? new Date(`${isoDate}T00:00:00Z`)
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const year = d.getUTCFullYear();
  const startYear = d.getUTCMonth() + 1 >= 8 ? year : year - 1;
  const yy = (y) => String(y % 100).padStart(2, "0");
  return `${yy(startYear)}_${yy(startYear + 1)}`;
}

/**
 * Make `base` unique against slugs that already exist: "karaoke-2026" ->
 * "karaoke-2026-2" -> "karaoke-2026-3".
 *
 * A collision is not an error worth showing the board — two events can honestly
 * share a name — so this resolves it silently rather than asking them to invent
 * a different title.
 *
 * @param {string} base
 * @param {Iterable<string>} taken
 * @returns {string}
 */
export function uniqueSlug(base, taken) {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

// Raster formats the build's sharp pipeline can actually decode — the same list
// src/lib/images.js globs for. HEIC is deliberately absent: it is what iPhones
// shoot by default and what sharp cannot read, so it is rejected at upload with
// an explanation rather than at build time with a failed deploy.
export const IMAGE_EXTENSIONS = [
  "webp", "jpg", "jpeg", "jfif", "png", "avif", "gif", "tif", "tiff", "bmp",
];

/**
 * The lowercased extension of an uploaded filename, or "" if it has none.
 * @param {string} filename
 * @returns {string}
 */
export function extensionOf(filename) {
  const match = /\.([a-z0-9]+)$/i.exec(String(filename ?? ""));
  return match ? match[1].toLowerCase() : "";
}

/**
 * Where an uploaded photo is stored, as a path relative to src/ — which is
 * exactly the string the content JSON holds (see the image note in CLAUDE.md).
 *
 * The basename is the entry's slug with underscores, matching the files already
 * in the repo (`meet_and_greet_2026.webp` next to `meet-and-greet-2026.json`).
 *
 * @param {string} dir   e.g. "images/events/26_27"
 * @param {string} slug  e.g. "meet-and-greet-2026"
 * @param {string} ext   e.g. "webp"
 * @returns {string}     e.g. "images/events/26_27/meet_and_greet_2026.webp"
 */
export function imagePathFor(dir, slug, ext) {
  return `${dir}/${slug.replace(/-/g, "_")}.${ext}`;
}

/**
 * Turn one raw form value into the value that goes into the JSON.
 *
 * The distinction that matters, and the reason this is a function rather than a
 * `|| null`: a blank OPTIONAL field becomes null, but a blank field that the
 * schema types as a plain string (a board member's `name` and `bio`) must stay
 * "". memberSchema accepts "" there and rejects null, because a seat with a
 * role and no name yet is a real, supported state. Collapsing both to null
 * fails validation on exactly the entry the board most often creates.
 *
 * @param {string | null} raw
 * @param {{ type: string, emptyValue: "" | null }} field
 * @returns {string | number | null}
 */
export function coerceField(raw, field) {
  const value = typeof raw === "string" ? raw.trim() : "";

  if (field.type === "number") {
    // "" -> null so the schema reports "expected a number" against the field
    // rather than silently storing 0 and reordering the board.
    return value === "" ? null : Number(value);
  }
  return value === "" ? field.emptyValue : value;
}

/**
 * Build the candidate entry: every key this save is allowed to produce.
 *
 * This defines WHICH keys exist, not the order they end up in — the committed
 * file takes its key order from the schema (see toFile in index.js), which is
 * the order the existing hand-authored files already use.
 *
 * `carried` holds the fields the form does not show and must not destroy. For an
 * event that is the machine-written `i18n` block: a Git-based editor writes back
 * only what it knows about, so dropping it here would silently strip every
 * translation on each save — the exact trap called out in CLAUDE.md. It is also
 * what makes the key present at all, so a brand new entry with no translations
 * yet is written without an empty `i18n` line.
 *
 * @param {{ name: string }[]} fields
 * @param {Record<string, unknown>} values
 * @param {Record<string, unknown>} carried
 * @returns {Record<string, unknown>}
 */
export function buildEntry(fields, values, carried = {}) {
  /** @type {Record<string, unknown>} */
  const out = {};
  if (carried.id !== undefined) out.id = carried.id;
  for (const field of fields) out[field.name] = values[field.name];
  if (carried.i18n !== undefined) out.i18n = carried.i18n;
  return out;
}

/**
 * The 4-digit year an event should be filed under, as a string.
 * Used to suffix the slug, matching `karaoke-2026`, `christmas-dinner-2025`.
 *
 * @param {string | null | undefined} isoDate
 * @param {Date} [now]
 * @returns {string}
 */
export function eventYear(isoDate, now = new Date()) {
  return /^\d{4}-/.test(String(isoDate ?? ""))
    ? String(isoDate).slice(0, 4)
    : String(now.getUTCFullYear());
}

/**
 * The filename slug for a new event: the title, plus the year unless the title
 * already ends in one ("Semester End Party 2026" must not become
 * "semester-end-party-2026-2026").
 *
 * @param {string} title
 * @param {string | null | undefined} isoDate
 * @param {Date} [now]
 * @returns {string}
 */
export function eventSlug(title, isoDate, now = new Date()) {
  const base = slugify(title);
  if (/-\d{4}$/.test(base)) return base;
  return `${base}-${eventYear(isoDate, now)}`;
}
