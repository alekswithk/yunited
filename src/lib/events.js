// Shared event logic, run at BUILD time (was js/events.js on the client).
// The same rules the old client used: an event is "past" only if it has a
// real date before today; everything else — future-dated or date-TBA — is
// upcoming, with TBA events floated to the top.

export function hasDate(event) {
  return typeof event.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(event.date);
}

// "2026-05-13" -> "13 May 2026"; a TBA (null/invalid) date shows "Date TBA".
export function formatEventDate(isoDate) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return "Date TBA";
  const date = new Date(isoDate + "T00:00:00");
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function splitEvents(allEvents, now = new Date()) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const past = allEvents
    .filter((e) => hasDate(e) && new Date(e.date + "T00:00:00") < today)
    .sort((a, b) => b.date.localeCompare(a.date)); // newest first

  const upcoming = allEvents
    .filter((e) => !(hasDate(e) && new Date(e.date + "T00:00:00") < today))
    .sort((a, b) => {
      if (!hasDate(a) && !hasDate(b)) return 0;
      if (!hasDate(a)) return -1; // TBA floats to the top
      if (!hasDate(b)) return 1;
      return a.date.localeCompare(b.date); // then soonest first
    });

  return { upcoming, past };
}
