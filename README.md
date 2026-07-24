# YUnited website

The website for **YUnited**, the Balkan / ex-Yugoslav student club at the
University of St. Gallen (HSG), live at **[yunited.ch](https://yunited.ch)**.

Static site built with [Astro](https://astro.build) and deployed on Cloudflare
(Workers static assets). Content is authored as JSON and rendered to HTML **at
build time** — no database, no server, no client-side data fetching. The site is
available in English and German, with Bosnian/Croatian/Serbian in progress.

There are two ways to work on it. Pick the one that matches what you're doing:

- **Editing content** (events, board members) → [I'm on the board](#for-the-board).
- **Changing the site itself** (design, pages, code) → [I'm a developer](#for-developers).

---

## For the board

You almost never need this repo directly. Edit the site through the admin panel:

### **[yunited.ch/admin](https://yunited.ch/admin)**

Add or edit events and board members through a simple form. Every save is a
commit to this repo; Cloudflare rebuilds and the change is live in about a
minute. Photos you upload are resized and optimized automatically.

Full walkthrough — logging in, adding an event, swapping a photo, getting a new
board member access — is in **[docs/CMS.md](docs/CMS.md)**.

A few things the site does for you, so they don't surprise you:

- **Events are never marked "past" by hand.** The site compares each event's
  date to today and files it under Upcoming or Past automatically. Leave the
  date empty for a "TBA" event — it shows at the top of Upcoming.
- **Membership prices, page copy, etc.** live in the code, not the CMS. Ask a
  developer, or [open an issue](../../issues).
- **German is translated automatically.** When you save an event, its title and
  description are machine-translated for the German site within a minute or two.
  (Bosnian/Croatian/Serbian are prepared the same way but not published yet.)

If you'd rather edit the JSON files directly, they're one-file-per-entry under
`content/events/` and `content/members/` — the field shapes are described below.

---

## For developers

### Prerequisites

Node 22 (matches CI). No other global tooling.

### Commands

```bash
npm install          # once
npm run dev          # local preview at http://localhost:4321
npm run build        # writes the finished static site to dist/
npm run preview      # serve the built dist/ locally
npm run check        # astro check — type/diagnostics, must be 0 errors
```

"A change is verified" when `npm run build` succeeds, `npm run check` is clean,
and — for content or rendering changes — the expected text appears in the built
HTML (e.g. `grep "Casino Night" dist/events.html`). There is no test suite.

### Architecture

The load-bearing idea: **content is authored as JSON and rendered to static HTML
at build time.** Pages never fetch data at runtime.

- `content/events/*.json` and `content/members/*.json` — one JSON file per entry,
  the entire content layer. An event's filename is its `id`.
- `src/lib/content.js` globs every entry, validates it against the Zod schemas in
  `src/lib/schema.js`, and is the only module pages import content through. A bad
  field fails `npm run build` with a message naming the file and field.
- `src/pages/[...locale]/*.astro` — one file per page, emitting both the English
  route (`/events`) and every localized one (`/de/events`) via a rest parameter.
- `src/layouts/BaseLayout.astro` — the single source of every page's `<head>`,
  the header/footer, and the small client script.
- `src/styles/global.css` — one stylesheet; all colours, spacing and shadows are
  CSS custom properties in the `:root` block at the top.

`CLAUDE.md` is the full architecture reference and the conventions that matter
(extensionless URLs, image paths relative to `src/`, the CSP, etc.).
`PLAN.md` is the living status tracker and roadmap.

### Content shape

The Zod schemas in `src/lib/schema.js` are authoritative. In brief:

**Event** (`content/events/<id>.json`)

| field | required | notes |
|---|---|---|
| `id` | ✓ | lowercase-with-dashes; must equal the filename |
| `title` | ✓ | |
| `date` | — | `YYYY-MM-DD`; empty = TBA (floats to top of Upcoming) |
| `time` | — | `HH:MM` 24-hour |
| `location` | — | empty = "Venue TBA"; never translated (it's an address) |
| `description` | ✓ | |
| `image` | ✓ | path relative to `src/`, e.g. `images/events/25_26/x.webp` |
| `rsvpUrl` | — | full URL to the uniclubs event page |
| `i18n` | — | **auto-managed** — machine translations; don't hand-edit |

**Board member** (`content/members/<role>.json`): `role` (required), `name`
(blank = "to be announced"), `bio`, `photo`, `order` (1 = the large lead card),
and the same auto-managed `i18n` block (translates `bio` only).

Images live under `src/images/` (not `public/`) so they go through Astro's sharp
pipeline — drop in any size/format and it's resized to WebP with a 1×/2× srcset.

### Internationalization

- `src/i18n/{en,de,bcs,sr}.json` are the UI dictionaries; `en.json` is the source
  of truth. Anything missing from a translation falls back to English.
- `src/i18n/config.js` is the locale registry. `complete: false` gates a locale:
  its pages generate and are viewable at their real URLs but are `noindex`, kept
  out of the sitemap, and hidden from the language switcher until the flag flips.
- Translations are filled **offline**, never during the build: `npm run translate`
  (UI strings) and `npm run translate:content` (event/member content) call DeepL
  and write the JSON, which you review and commit. Both need a `DEEPL_API_KEY` —
  copy `.env.example` to `.env` and paste one in. The build itself is hermetic:
  no network, no secrets.

Full i18n conventions are in `CLAUDE.md`.

### Deploy

Cloudflare builds the repo with `npm run build` and serves `dist/` as Workers
static assets (`wrangler.jsonc` sets `assets.directory: "./dist"`). Publishing is
just merging to `main`:

```bash
git push        # to main → Cloudflare rebuilds and redeploys in ~1 minute
```

Two things live **outside** the repo and are worth knowing:

- **The build command** (`npm run build`) is configured in the Cloudflare Workers
  Builds dashboard, not in any file here. If the Cloudflare project is ever
  recreated, set it there.
- **`DEEPL_API_KEY`** is a GitHub Actions secret, used only by the auto-translate
  workflow (`.github/workflows/translate-content.yml`) — never by the site build.

`public/_headers` carries the Content-Security-Policy and cache rules and is
copied verbatim into `dist/`. The public site's CSP is strict (`script-src
'self'`, self-hosted fonts); `/admin` has its own looser policy scoped to that
path.

### Repository map

```
content/          one JSON file per event / board member (the edit surface)
src/
  pages/          one .astro per page; [...locale] emits /events and /de/events
  layouts/        BaseLayout.astro — <head>, header, footer, once
  components/     EventCard, MemberLead, MemberRow, Portrait, Header, Footer
  lib/            build-time logic: content loading, Zod schema, event/date helpers
  i18n/           locale registry + {en,de,bcs,sr}.json dictionaries
  styles/         global.css — design tokens at the top
  images/         source images (optimized at build)
public/           copied verbatim into dist/ — /admin (CMS), _headers, assets/
scripts/          vendor-cms + the offline DeepL translation helpers
.github/          CI (build+check on PRs) + the auto-translate workflow
astro.config.mjs, wrangler.jsonc   build & deploy config
```

More detail: **[CLAUDE.md](CLAUDE.md)** (architecture & conventions),
**[PLAN.md](PLAN.md)** (status & roadmap), **[docs/CMS.md](docs/CMS.md)** (the CMS).
