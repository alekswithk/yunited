# How to update this website

This is the Yunited club website. It's a static site built with
[Astro](https://astro.build) — no database, no admin panel. **All the content
you'd ever normally change lives in two small files:**

- `content/events.json` — every event (upcoming and past)
- `content/members.json` — the board members

You edit those files, save, and push the change. That's it. You never need to
touch the HTML, CSS or JavaScript to add an event or a board member.

> Tip: you can also just open this folder with an AI coding assistant (like
> Claude Code) and say "add an event called X on date Y" — these files are
> deliberately simple so that works reliably.

---

## Add or edit an event

Open `content/events.json`. It's a list of events. Copy an existing block,
paste it at the top, and change the values:

```json
{
  "id": "spring-mixer-2027",
  "title": "Spring Mixer",
  "date": "2027-03-14",
  "time": "19:00",
  "location": "Rosenberg, St. Gallen",
  "description": "One to three short sentences about the event.",
  "image": "images/events/spring-mixer-2027.webp",
  "rsvpUrl": "https://uniclubs.ch/hsg/clubs/yunited/events/spring-mixer"
}
```

Field notes:

- **id** — any unique short name, lowercase with dashes.
- **date** — always `YYYY-MM-DD`. **You never mark events as "past"** — the
  site compares the date to today and automatically shows the event under
  "Upcoming" or "Past events".
- **time** — `"19:00"` format, or `null` if unknown.
- **image** — path to a photo (see "Swap or add a photo" below), or `null`
  to show a colored placeholder tile.
- **rsvpUrl** — the uniclubs event page for tickets/RSVP, or `null`.

Careful with commas: every event block ends with a comma **except the last
one in the list**. If the events page suddenly shows nothing, a missing or
extra comma in this file is the most likely cause — paste the file into
https://jsonlint.com to find the typo.

## Add or edit a board member

Open `content/members.json` and edit the same way:

```json
{
  "name": "Ana Marković",
  "role": "President",
  "photo": "images/members/ana-markovic.webp",
  "bio": "Optional one-liner — leave as \"\" to show nothing."
}
```

If `photo` is `null`, the site shows the person's initials instead. Members
appear on the page in the same order as in this file.

## Swap or add a photo

1. Use a normal photo — JPG, PNG or WebP, **any size is fine** (you can drop
   in a photo straight from a phone). The build automatically resizes it and
   creates responsive versions, so you no longer need to shrink it yourself.
   Use a simple lowercase filename with dashes.
2. Put event photos in `src/images/events/` and member photos in
   `src/images/members/`. (In the JSON you write the path relative to `src/`,
   e.g. `images/events/prvi-maj-2026.webp`.)
3. Point the `image` / `photo` field in the JSON at it, e.g.
   `"images/events/prvi-maj-2026.webp"`. A path with no matching file makes
   the build fail with a clear message, so a typo can't ship a broken image.

Every photo gets its alt text generated from the event/member name
automatically, so descriptive titles and names matter.

## Change text on a page

Page text (About story, Exchange info, etc.) lives in the page files under
`src/pages/` — `about.astro`, `exchange.astro`, and so on. Open the file, find
the text, and change it between the tags (everything below the `---` line at the
top is plain HTML). Anything marked `[PLACEHOLDER: …]` is waiting for real
content from the board — replace the whole bracket.

The shared header and footer live once in `src/components/` and
`src/layouts/BaseLayout.astro`, so a change there updates every page at once.

## The contact form

The form on the contact page (`src/pages/contact.astro`) sends messages via **Formspree** (free tier), which
forwards them to the club inbox (yunited@shsg.ch). It posts to
`https://formspree.io/f/xeeyoryk` — set up under the club Formspree account,
where submissions are also archived.

Submissions go out over `fetch`, so the visitor stays on the page and sees an
in-page confirmation. The `action` attribute points at the same endpoint, so if
JavaScript fails the browser posts the form natively and Formspree shows its own
thank-you page — nothing gets lost either way.

Two things to know before changing it:

- **Recipients** are configured in the Formspree dashboard, not in this repo.
  Adding a board member to the notification list is a dashboard change.
- **The CSP in `_headers`** allow-lists `https://formspree.io` under both
  `connect-src` (the fetch) and `form-action` (the no-JS fallback). Pointing the
  form at a different provider means updating both.

## Publish your change

The site is built by Astro and deployed on Cloudflare. To publish:

1. Commit and push your edit to the `main` branch.
2. Cloudflare runs `npm run build` and deploys the result — the live site
   updates in a minute or two.

To preview locally before pushing, you need Node installed, then from this
folder run:

```
npm install      # once, the first time
npm run dev       # starts a local preview at http://localhost:4321
```

Open the address it prints. To reproduce exactly what gets deployed, run
`npm run build` and it writes the finished site to `dist/`.

---

## What's where (for the curious)

```
content/    ← events.json + members.json — 95% of edits happen here
public/     ← files served as-is: images/, assets/ (fonts, favicon), _headers
src/
  pages/       ← one file per page (index.astro, about.astro, …)
  layouts/     ← BaseLayout.astro: the <head>, header and footer, once
  components/  ← EventCard, MemberLead, Header, Footer, …
  styles/      ← global.css — colors & fonts are variables at the top
  lib/         ← the small helpers that sort events and members at build time
astro.config.mjs, package.json  ← build config
```

Design rules baked in: colors and spacing come from CSS variables at the top
of `src/styles/global.css`; one `card` style is shared by events and members;
the same event card renders both upcoming and past events from the same JSON.
Event and member content is rendered into the HTML **at build time**, so it's
visible to search engines and link previews (no JavaScript required to see it).
