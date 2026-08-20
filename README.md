# YUnited website

The website for **YUnited**, the Balkan / ex-Yugoslav student club at the
University of St. Gallen (HSG), live at **[yunited.ch](https://yunited.ch)**.

Static site built with [Astro](https://astro.build) and deployed on Cloudflare
(Workers static assets). Content is authored as JSON and rendered to HTML **at
build time** — no database, no server, no client-side data fetching. The site is
published in **five languages**: English, German, Bosnian, Croatian and Serbian.

There are two ways to work on it. Pick the one that matches what you're doing:

- **Editing content** (events, board members) → [I'm on the board](#for-the-board).
- **Changing the site itself** (design, pages, code) → [I'm a developer](#for-developers).

---

## For the board

You almost never need this repo directly. Edit the site through the admin panel:

### **[yunited.ch/admin](https://yunited.ch/admin)**

Add or edit events, board members and partners through a simple form. Sign in
with your email — Cloudflare sends you a one-time code, and that's the whole
login. Every save is a commit to this repo; Cloudflare rebuilds and the change is
live in a minute or two. Photos you upload are resized and optimized
automatically.

The page has a **`?` button in the corner** with the full walkthrough — every
field, whether it's required, and an example. Signing in, giving a new board
member access and what to do when something goes wrong are in
**[docs/ADMIN.md](docs/ADMIN.md)**.

A few things the site does for you, so they don't surprise you:

- **Events are never marked "past" by hand.** The site compares each event's
  date to today and files it under Upcoming or Past automatically. Leave the
  date empty for a "TBA" event — it shows at the top of Upcoming.
- **Membership prices, page copy, etc.** live in the code, not the admin panel.
  Ask a developer, or [open an issue](../../issues).
- **Events are translated as you save them.** Pressing Save fills in the German,
  Bosnian, Croatian and Serbian title and description in the same go, and each
  event's row says whether that worked. Every event has a **Translations** page
  next to its Content page where you can read those four and correct any of them
  by hand — a correction stays until you change the English text itself. Board
  members' names, roles and bios are deliberately *not* translated: they appear
  as you typed them everywhere.
- **If translations stop happening**, open the **Translations** tab. It says
  whether the club's DeepL key is working, and anyone on the board can paste in a
  new free one — no developer, no Cloudflare account.

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
npm test             # unit tests for src/lib, worker/ and scripts/lib
npm run check:dist   # post-build assertions on dist/
npm run admin:dev    # the admin panel + its Worker, on http://localhost:8787
```

"A change is verified" when `npm test`, `npm run build`, `npm run check` and
`npm run check:dist` all pass — that is exactly what CI runs — and, for content
or rendering changes, the expected text appears in the built HTML (e.g.
`grep "Casino Night" dist/events.html`).

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

The one exception to "no server" is `/admin`:

- `worker/` — a small Cloudflare Worker serving `/admin/api/*`. It is the only
  server-side code in the project, and the only thing that holds a GitHub token.
  It commits the board's edits, validating them against the same Zod schemas the
  build uses. **[`worker/README.md`](worker/README.md)** covers it in full.
- `public/admin/` — the panel itself: three plain files, no framework.

`CLAUDE.md` is the full architecture reference and the conventions that matter
(extensionless URLs, image paths relative to `src/`, the CSP, etc.).
`PLAN.md` is the living status tracker and roadmap.

### Content shape

The Zod schemas in `src/lib/schema.js` are authoritative. In brief:

**Event** (`content/events/<id>.json`)

| field | required | notes |
|---|---|---|
| `id` | — | lowercase-with-dashes; if present, must equal the filename. Entries created in `/admin` omit it — the filename *is* the id |
| `title` | ✓ | |
| `date` | — | `YYYY-MM-DD`; empty = TBA (floats to top of Upcoming) |
| `time` | — | `HH:MM` 24-hour |
| `location` | — | empty = the line is left off the card; never translated (it's an address) |
| `description` | ✓ | |
| `image` | ✓ | path relative to `src/`, e.g. `images/events/25_26/x.webp` |
| `rsvpUrl` | — | full URL to the uniclubs event page |
| `i18n` | — | **auto-managed** — machine translations; don't hand-edit |

**Board member** (`content/members/<role>.json`): `role` (required), `name`
(blank = "to be announced"), `bio`, `photo`, `order` (1 = the large lead card).
Members carry **no `i18n` block and are never translated** — a person's name,
role and bio show the same on every language's page.

**Partner** (`content/partners/<name>.json`): `name` and `order` (required),
`url` and `logo` (optional). Also never translated.

Images live under `src/images/` (not `public/`) so they go through Astro's sharp
pipeline — drop in any size/format and it's resized to WebP with a 1×/2× srcset.

### Internationalization

- `src/i18n/{en,de,hr,bs,sr}.json` are the UI dictionaries; `en.json` is the source
  of truth. Anything missing from a translation falls back to English.
- `src/i18n/config.js` is the locale registry. `complete: false` gates a locale:
  its pages generate and are viewable at their real URLs but are `noindex`, kept
  out of the sitemap, and hidden from the language switcher until the flag flips.
- Translations are filled **offline**, never during the build: `npm run translate`
  (UI strings) and `npm run translate:content` (event content) call DeepL and
  write the JSON, which you review and commit. Both need a `DEEPL_API_KEY` —
  copy `.env.example` to `.env` and paste one in (the free tier is enough). The
  build itself is hermetic: no network, no secrets.
- **Each string is translated in its own request, with DeepL's `context`
  parameter carrying whatever disambiguates it** — the sentence a split
  Pre/Link/Post fragment belongs to, or an event's other translated field. This
  replaced an offline Claude pipeline (2026-08, board decision — a metered key
  billed to whoever is currently president is not something the club can
  depend on); see the header comment in `scripts/translate.mjs` for what that
  trades away and how `src/lib/translate/validate.js` covers for it.
- `src/lib/translate/glossary.js` holds the policy: names that are never translated
  (`Meet & Greet`, `Svadba`, `Déja Vu Bar`), one pinned term per concept per
  language, the Croatian/Bosnian lexis split, and the address form. **Nothing is
  written until `src/lib/translate/validate.js` passes** — it is unit-tested in
  `npm test`, and it exists because these defects are invisible to every other
  command in the repo.
- **Bosnian and Croatian have separate dictionaries.** They shared one (`bcs`)
  until it turned out to be Croatian with stray Bosnian forms in it, so Bosnian
  readers were served inconsistent Croatian.

Full i18n conventions are in `CLAUDE.md`.

### Deploy

Cloudflare builds the repo with `npm run build` and serves `dist/` as Workers
static assets (`wrangler.jsonc` sets `assets.directory: "./dist"`). The admin
Worker is part of the **same** Worker (`main: worker/index.js`, with
`run_worker_first` routing only `/admin/api/*` to it), so it deploys with the
site — there is no second deploy step. Publishing is just merging to `main`:

```bash
git push        # to main → Cloudflare rebuilds and redeploys in ~1 minute
```

Three things live **outside** the repo and are worth knowing:

- **Handing the site over?** [`docs/HANDOVER.md`](docs/HANDOVER.md) lists every
  account and credential it depends on, and what breaks without each.
- **The build command** (`npm run build`) is configured in the Cloudflare Workers
  Builds dashboard, not in any file here. If the Cloudflare project is ever
  recreated, set it there.
- **`GITHUB_TOKEN`** is an encrypted Worker secret, set with
  `npx wrangler secret put GITHUB_TOKEN`. It is what lets `/admin` commit. See
  [`worker/README.md`](worker/README.md).
- **`DEEPL_API_KEY`** is an encrypted Worker secret, set with
  `npx wrangler secret put DEEPL_API_KEY`. `/admin` translates each event as it is
  saved, and a nightly cron sweep fills anything missed. The board can override it
  from the Translations tab without a deploy — see
  [`worker/README.md`](worker/README.md). Never read by the site build, which
  stays hermetic.

Who may reach `/admin` is managed by the board itself, in the panel's **Access**
tab (it rewrites the `yunited-board` Access group). The break-glass path, if
nobody can get in at all, is the Cloudflare Zero Trust dashboard — see
[`docs/ADMIN.md`](docs/ADMIN.md). No code change, no deploy, no GitHub account.

`public/_headers` carries the Content-Security-Policy and cache rules and is
copied verbatim into `dist/`. The public site's CSP is strict — `script-src`
and `style-src` are `'self'` with **no `'unsafe-inline'`**, and fonts are
self-hosted — so don't add `style="…"` attributes or `<script is:inline>` to a
page; put the rules in `global.css` and let Astro bundle the script. `/admin` has
its own policy scoped to that path, equally strict.

### Repository map

```
content/          one JSON file per event / board member / partner (the edit surface)
src/
  pages/          one .astro per page; [...locale] emits /events and /de/events
  layouts/        BaseLayout.astro — <head>, header, footer, once
  components/     EventCard, MemberLead, MemberRow, Portrait, PageToc, Header, Footer
  lib/            build-time logic: content loading, Zod schema, event/date helpers
  i18n/           locale registry + {en,de,hr,bs,sr}.json dictionaries
  styles/         global.css — design tokens at the top
  images/         source images (optimized at build)
worker/           the /admin API — the only server-side code; holds the GitHub token
public/           copied verbatim into dist/ — admin/ (the panel), _headers, assets/
scripts/          mirror-media + the offline translation pipeline (glossary, gate)
.github/          CI (test+build+check on PRs) + the auto-translate workflow
astro.config.mjs, wrangler.jsonc   build & deploy config
```

More detail: **[CLAUDE.md](CLAUDE.md)** (architecture & conventions),
**[PLAN.md](PLAN.md)** (status & roadmap), **[docs/ADMIN.md](docs/ADMIN.md)**
(using the admin panel), **[worker/README.md](worker/README.md)** (maintaining
it).
