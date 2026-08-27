// One static .ics file per dated event, at /events/<id>.ics — a real,
// navigable URL rather than the data: URI EventCard used to link directly.
// iOS Safari needs this: a data: URI plus `download` forces a raw-text
// download there instead of the native "Add to Calendar" sheet, which only
// appears when Safari navigates to a URL whose response is text/calendar.
// public/_headers pins that Content-Type for this path explicitly, rather
// than relying on Cloudflare's own extension-based guess.
//
// Non-localized, like events.xml.js next door — an event's date, time and
// location aren't translated (see CLAUDE.md), so one file serves every
// locale's "add to calendar" link.
import { events } from "../../lib/content.js";
import { hasDate, icsCalendar } from "../../lib/events.js";

export function getStaticPaths() {
  return events.filter(hasDate).map((event) => ({ params: { id: event.id } }));
}

export function GET({ params }) {
  const event = events.find((e) => e.id === params.id);
  return new Response(icsCalendar(event));
}
