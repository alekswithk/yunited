// Tests for the one piece of real logic in the repo.
//
// Everything else here is declarative — content is JSON, pages are markup, the
// schema either accepts a file or fails the build loudly. events.js is
// different: it decides what the events page SHOWS. If splitEvents() gets the
// boundary wrong, a past party sits under "Upcoming" (or next week's vanishes)
// and the build is still perfectly green. There is no error to see, which is
// exactly why this file exists.
//
// Run with `npm test`. No framework — node:test is built in, and this module is
// deliberately framework-free (see CLAUDE.md), so the tests import it directly.
import { test } from "node:test";
import assert from "node:assert/strict";
import { splitEvents, hasDate, formatEventDate } from "./events.js";

// `now` is injected into splitEvents precisely so these assertions do not rot:
// the same input must give the same answer whenever the suite is run.
const NOW = new Date("2026-07-28T12:00:00");

const event = (id, date, time = null) => ({ id, date, time });

test("hasDate accepts a real ISO date and nothing else", () => {
  assert.equal(hasDate({ date: "2026-05-13" }), true);
  assert.equal(hasDate({ date: null }), false);
  assert.equal(hasDate({ date: "" }), false);
  assert.equal(hasDate({}), false);
  assert.equal(hasDate({ date: "13-05-2026" }), false);
  assert.equal(hasDate({ date: "2026-5-3" }), false);
});

test("an event is past only once its date is behind us", () => {
  const { upcoming, past } = splitEvents(
    [event("yesterday", "2026-07-27"), event("tomorrow", "2026-07-29")],
    NOW,
  );
  assert.deepEqual(upcoming.map((e) => e.id), ["tomorrow"]);
  assert.deepEqual(past.map((e) => e.id), ["yesterday"]);
});

test("an event happening today is still upcoming", () => {
  // The boundary that matters to the board: nobody wants the party they are
  // walking to tonight filed under "Past events" because the clock passed 00:00.
  const { upcoming, past } = splitEvents([event("today", "2026-07-28")], NOW);
  assert.deepEqual(upcoming.map((e) => e.id), ["today"]);
  assert.equal(past.length, 0);
});

test("the time of day never decides past vs upcoming", () => {
  // splitEvents normalizes `now` to midnight, so an event dated today is
  // upcoming whether it is 08:00 or 23:59.
  for (const hour of ["00:00:01", "08:00:00", "23:59:59"]) {
    const { upcoming } = splitEvents(
      [event("today", "2026-07-28", "09:00")],
      new Date(`2026-07-28T${hour}`),
    );
    assert.deepEqual(upcoming.map((e) => e.id), ["today"], `failed at ${hour}`);
  }
});

test("a TBA event floats to the top of upcoming", () => {
  const { upcoming } = splitEvents(
    [event("dated", "2026-08-01"), event("tba", null), event("later", "2026-09-01")],
    NOW,
  );
  assert.deepEqual(upcoming.map((e) => e.id), ["tba", "dated", "later"]);
});

test("a TBA event is never past, however old the file is", () => {
  const { past } = splitEvents([event("tba", null)], NOW);
  assert.equal(past.length, 0);
});

test("upcoming runs soonest first, past runs newest first", () => {
  const { upcoming, past } = splitEvents(
    [
      event("far", "2026-12-01"),
      event("soon", "2026-08-01"),
      event("old", "2025-12-10"),
      event("recent", "2026-05-13"),
    ],
    NOW,
  );
  assert.deepEqual(upcoming.map((e) => e.id), ["soon", "far"]);
  assert.deepEqual(past.map((e) => e.id), ["recent", "old"]);
});

test("same-date events are broken by time, in opposite directions", () => {
  // Two events really do share 2026-05-13 in content/events (Global Village and
  // the Semester End Party), so this tiebreak is load-bearing, not theoretical.
  const sameDay = [event("late", "2026-08-15", "22:00"), event("early", "2026-08-15", "18:00")];

  const { upcoming } = splitEvents(sameDay, NOW);
  assert.deepEqual(upcoming.map((e) => e.id), ["early", "late"], "upcoming: earlier first");

  const { past } = splitEvents(sameDay, new Date("2026-09-01T12:00:00"));
  assert.deepEqual(past.map((e) => e.id), ["late", "early"], "past: later first");
});

test("an event with no time sorts after one that has a time, either way", () => {
  const sameDay = [event("untimed", "2026-08-15", null), event("timed", "2026-08-15", "18:00")];

  const { upcoming } = splitEvents(sameDay, NOW);
  assert.deepEqual(upcoming.map((e) => e.id), ["timed", "untimed"]);

  const { past } = splitEvents(sameDay, new Date("2026-09-01T12:00:00"));
  assert.deepEqual(past.map((e) => e.id), ["timed", "untimed"]);
});

test("a malformed time is treated as no time, not as a sort key", () => {
  const { upcoming } = splitEvents(
    [event("bad", "2026-08-15", "7pm"), event("good", "2026-08-15", "18:00")],
    NOW,
  );
  assert.deepEqual(upcoming.map((e) => e.id), ["good", "bad"]);
});

test("splitEvents does not mutate or drop its input", () => {
  const input = [event("a", "2026-08-01"), event("b", null), event("c", "2025-01-01")];
  const snapshot = JSON.parse(JSON.stringify(input));
  const { upcoming, past } = splitEvents(input, NOW);
  assert.deepEqual(input, snapshot, "input array was reordered in place");
  assert.equal(upcoming.length + past.length, input.length, "an event went missing");
});

test("dates are formatted day-first for both published date locales", () => {
  // The whole reason config.js carries region-qualified tags: plain "en" would
  // render "May 13, 2026" for a Swiss club.
  assert.equal(formatEventDate("2026-05-13", "en-GB"), "13 May 2026");
  assert.equal(formatEventDate("2026-05-13", "de-CH"), "13. Mai 2026");
  assert.match(formatEventDate("2026-05-13", "sr-Latn-RS"), /^13\.\s*maj\s*2026\.?$/);
});

test("formatEventDate returns null for TBA rather than an English string", () => {
  // The caller renders its own dictionary's "date to be announced"; this module
  // must not leak English into a localized page.
  assert.equal(formatEventDate(null), null);
  assert.equal(formatEventDate(""), null);
  assert.equal(formatEventDate("not a date"), null);
});

test("formatEventDate does not drift by a day across timezones", () => {
  // Parsing "2026-01-01" as UTC midnight and rendering it west of Greenwich
  // would print 31 December. The module appends T00:00:00 to force local time.
  assert.equal(formatEventDate("2026-01-01", "en-GB"), "1 January 2026");
});
