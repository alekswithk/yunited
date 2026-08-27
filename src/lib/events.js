// Shared event logic, run at BUILD time (was js/events.js on the client).
// The same rules the old client used: an event is "past" only if it has a
// real date before today; everything else — future-dated or date-TBA — is
// upcoming, with TBA events floated to the top.

// The annotations below are structural on purpose — `{ date, time }` and not an
// import of the Event type. This module stays framework-free AND schema-free
// (see CLAUDE.md); typing it against the Zod schema would couple the sort logic
// to the board's edit surface. splitEvents is generic instead, so it hands back
// whatever it was given: pages calling splitEvents(events) get a typed Event[]
// on both sides of the split without this file knowing what an Event is.

/**
 * @param {{ date?: string | null }} event
 * @returns {boolean}
 */
export function hasDate(event) {
  return typeof event.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(event.date);
}

// "2026-05-13" -> "13 May 2026" (en-GB) or "13. Mai 2026" (de-CH). `localeTag`
// is a BCP 47 tag — pass the locale's `dateLocale` from i18n/config.js, which
// is region-qualified precisely so month/day order comes out right.
//
// Returns null for a TBA (null/invalid) date rather than an English string: this
// module stays framework- and dictionary-free, so the caller renders whatever
// its dictionary says for "date to be announced".
/**
 * @param {string | null | undefined} isoDate
 * @param {string} [localeTag]
 * @returns {string | null}
 */
export function formatEventDate(isoDate, localeTag = "en-GB") {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const date = new Date(isoDate + "T00:00:00");
  return date.toLocaleDateString(localeTag, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// "20:30" -> "20:30" for a real time, null otherwise. Used only as a tiebreaker
// between events that share a date; a missing time always sorts last.
/**
 * @param {{ time?: string | null }} event
 * @returns {string | null}
 */
function timeKey(event) {
  return typeof event.time === "string" && /^\d{2}:\d{2}$/.test(event.time)
    ? event.time
    : null;
}

// Break a same-date tie by time of day. `dir` is +1 to put earlier times first
// (upcoming: soonest first) or -1 to put later times first (past: newest first).
// Events without a time sort after those with one, either way.
/**
 * @param {{ time?: string | null }} a
 * @param {{ time?: string | null }} b
 * @param {1 | -1} dir
 * @returns {number}
 */
function byTime(a, b, dir) {
  const ta = timeKey(a);
  const tb = timeKey(b);
  if (ta === tb) return 0;
  if (ta === null) return 1;
  if (tb === null) return -1;
  return dir * ta.localeCompare(tb);
}

// One schema.org Event block per dated event, for Google's Event rich results.
// Pure and framework-free, like the rest of this module: the caller (events.astro)
// supplies the already-localized title/description and the page url, and this
// just shapes them. Returns null for a TBA-dated event — schema.org requires a
// startDate, so there is nothing valid to emit.
/**
 * @param {{ title: string, description: string, date?: string | null, time?: string | null, location?: string | null }} event
 * @param {{ url: string }} options
 * @returns {object | null}
 */
export function eventJsonLd(event, { url }) {
  if (!hasDate(event)) return null;
  const time = timeKey(event);
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    startDate: time ? `${event.date}T${time}` : event.date,
    description: event.description,
    url,
    ...(event.location ? { location: { "@type": "Place", name: event.location } } : {}),
  };
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

// "2026-05-13" + "20:30" -> a Date holding that wall-clock moment. Only ever
// used for wall-clock arithmetic below (a 2-hour default duration, an all-day
// event's exclusive end date) and read back through the local getters
// (getFullYear/getMonth/…), never through toLocaleString or similar — so it
// does not matter which timezone the process itself runs in, on a build
// server or a developer's laptop alike.
function wallClock(date, time = "00:00") {
  return new Date(`${date}T${time}:00`);
}

function compactDate(d) {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

function compactDateTime(d) {
  return `${compactDate(d)}T${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}

// The one timestamp in the file that IS required to be UTC (RFC 5545 §3.8.7.2
// DTSTAMP: "the date and time that the instance … was created"), unlike
// DTSTART/DTEND below, which stay floating local time on purpose.
function icsTimestampUtc(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

// RFC 5545 §3.3.11 TEXT escaping: backslash first (so the escapes just added
// are not themselves re-escaped), then comma and semicolon, then a literal
// newline collapsed to the two-character "\n" the format expects.
//
// Not done: §3.1 line folding (splitting a content line past 75 octets onto a
// continuation line). That is a SHOULD, not a MUST, and most calendar clients
// accept an unfolded long line in practice — but that claim is derived from
// the spec, not verified against a real client here. An event with an
// unusually long authored description is the case to check first if an
// "add to calendar" import is ever reported broken.
function escapeIcsText(text) {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

// A per-event "add to calendar" link: one VEVENT wrapped in a data: URI, so
// clicking it needs no backend and no client JS — the browser hands it
// straight to whatever app owns .ics files. Returns null for a TBA event,
// same as eventJsonLd, since there is no date to add.
//
// DTSTART/DTEND are written as FLOATING local time (no Z, no TZID): the
// schema records no timezone and every YUnited event happens in St. Gallen,
// so a floating time — read by every calendar app as "the device's local
// time" — is the correct rendering for every attendee. A dateless field is
// impossible here (hasDate already excluded it); a timeless one is emitted as
// a whole-day event instead, with the exclusive end date one day later, per
// RFC 5545 §3.6.1. There is no stored end time, so a timed event defaults to
// a 2-hour block — long enough for a talk, short enough not to claim the rest
// of the attendee's evening for a brunch.
/**
 * @param {{ id?: string, title: string, description: string, date?: string | null, time?: string | null, location?: string | null }} event
 * @param {{ now?: Date }} [options]
 * @returns {string | null}
 */
export function icsDataUri(event, { now = new Date() } = {}) {
  if (!hasDate(event)) return null;
  const time = timeKey(event);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//YUnited//Events//EN",
    "BEGIN:VEVENT",
    `UID:${event.id ?? `${event.date}-${time ?? "tba"}`}@yunited.ch`,
    `DTSTAMP:${icsTimestampUtc(now)}`,
  ];

  if (time) {
    const start = wallClock(event.date, time);
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    lines.push(`DTSTART:${compactDateTime(start)}`, `DTEND:${compactDateTime(end)}`);
  } else {
    const start = wallClock(event.date);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    lines.push(`DTSTART;VALUE=DATE:${compactDate(start)}`, `DTEND;VALUE=DATE:${compactDate(end)}`);
  }

  lines.push(`SUMMARY:${escapeIcsText(event.title)}`);
  if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
  lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");

  const ics = lines.join("\r\n") + "\r\n";
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}

/**
 * @template {{ date?: string | null, time?: string | null }} T
 * @param {readonly T[]} allEvents
 * @param {Date} [now]
 * @returns {{ upcoming: T[], past: T[] }}
 */
export function splitEvents(allEvents, now = new Date()) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const past = allEvents
    .filter((e) => hasDate(e) && new Date(e.date + "T00:00:00") < today)
    .sort((a, b) => b.date.localeCompare(a.date) || byTime(a, b, -1)); // newest first

  const upcoming = allEvents
    .filter((e) => !(hasDate(e) && new Date(e.date + "T00:00:00") < today))
    .sort((a, b) => {
      if (!hasDate(a) && !hasDate(b)) return 0;
      if (!hasDate(a)) return -1; // TBA floats to the top
      if (!hasDate(b)) return 1;
      return a.date.localeCompare(b.date) || byTime(a, b, 1); // then soonest first
    });

  return { upcoming, past };
}
