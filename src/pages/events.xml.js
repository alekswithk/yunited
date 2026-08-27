// Non-localized on purpose — like 404.astro, this sits outside
// src/pages/[...locale]/. English is the source of truth for event content
// (see CLAUDE.md), and a maintenance/notification feed doesn't need five
// copies. Board and members otherwise have no way to notice a new or changed
// event short of checking /events by hand.
import rss from "@astrojs/rss";
import { events } from "../lib/content.js";
import { hasDate, eventRssItem } from "../lib/events.js";

export async function GET(context) {
  // Undated (TBA) events have no pubDate to sort by, so they lead the feed —
  // the same "floats to the top" rule splitEvents() uses for the page itself.
  // Dated ones follow, newest date first: with no last-modified timestamp
  // anywhere in the schema, an event's own date is the only proxy this repo
  // has for "when did this become news".
  const undated = events.filter((e) => !hasDate(e));
  const dated = events.filter(hasDate).sort((a, b) => b.date.localeCompare(a.date));

  return rss({
    title: "YUnited events",
    description:
      "Upcoming and past events from YUnited, the Balkan & ex-Yu student club at HSG.",
    site: context.site,
    items: [...undated, ...dated].map((event) => eventRssItem(event, { link: "/events" })),
  });
}
