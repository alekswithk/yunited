// Shared event logic, run at BUILD time (was js/events.js on the client).
// The same rules the old client used: an event is "past" only if it has a
// real date before today; everything else — future-dated or date-TBA — is
// upcoming, with TBA events floated to the top.

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
function timeKey(event) {
  return typeof event.time === "string" && /^\d{2}:\d{2}$/.test(event.time)
    ? event.time
    : null;
}

// Break a same-date tie by time of day. `dir` is +1 to put earlier times first
// (upcoming: soonest first) or -1 to put later times first (past: newest first).
// Events without a time sort after those with one, either way.
function byTime(a, b, dir) {
  const ta = timeKey(a);
  const tb = timeKey(b);
  if (ta === tb) return 0;
  if (ta === null) return 1;
  if (tb === null) return -1;
  return dir * ta.localeCompare(tb);
}

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
