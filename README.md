# How to update this website

This is the Yunited club website. It's a plain static site — no database, no
admin panel. **All the content you'd ever normally change lives in two small
files:**

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

1. Save the photo as a `.webp` file (any online "convert to WebP" tool works;
   aim for under ~300 KB). Use a simple lowercase filename with dashes.
2. Put event photos in `images/events/` and member photos in
   `images/members/`.
3. Point the `image` / `photo` field in the JSON at it, e.g.
   `"images/events/prvi-maj-2026.webp"`.

Every photo gets its alt text generated from the event/member name
automatically, so descriptive titles and names matter.

## Change text on a page

Page text (About story, Exchange info, etc.) lives in the `.html` files —
`about.html`, `exchange.html`, and so on. Open the file, find the text, change
it between the tags. Anything marked `[PLACEHOLDER: …]` is waiting for real
content from the board — replace the whole bracket.

## The contact form

The form on `contact.html` sends messages via **Formspree** (free tier), which
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

The site is a static folder — it deploys anywhere. With Vercel or Netlify
connected to this git repository:

1. Commit and push your edit to the `main` branch.
2. The host auto-deploys — the live site updates in about a minute.

To preview locally before pushing, run a tiny web server from this folder
(opening `index.html` directly won't load the JSON content):

```
python3 -m http.server 8000
```

then open http://localhost:8000 in your browser.

---

## What's where (for the curious)

```
content/    ← events.json + members.json — 95% of edits happen here
images/     ← photos (events/ and members/ subfolders)
css/        ← one stylesheet; colors & fonts are variables at the top
js/         ← three small scripts: menu/animations, event cards, member cards
assets/     ← favicon + the folk-pattern divider graphic
*.html      ← one file per page
```

Design rules baked in: colors and spacing come from CSS variables at the top
of `css/styles.css`; one `card` style is shared by events and members; the
same event card renders both upcoming and past events from the same JSON.
