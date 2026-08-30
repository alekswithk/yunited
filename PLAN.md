# PLAN.md — YUnited website: status & roadmap

**Purpose.** The live tracker: the repo map, what is still **open**, and what is
**planned**. This file holds *only work not yet done*. Completed work, the shipped-PR
table, and the reasoning behind past decisions live in
**[`PLAN-ARCHIVE.md`](PLAN-ARCHIVE.md)**. When a task here ships, move its entry to
the archive in the same PR — do not let this file grow a history section again.

- **What this is:** the static website for **YUnited**, the Balkan / ex-Yu student
  club at the University of St. Gallen (HSG), served at **yunited.ch**.
- **Stack:** [Astro](https://astro.build) (build-time rendering) → static files →
  **Cloudflare Workers** static assets. No database for content; per-student buddy
  signups live in **Cloudflare D1**, reached only through the Worker.
- **Deeper docs:** architecture & conventions → [`CLAUDE.md`](CLAUDE.md); using the
  admin panel → [`docs/ADMIN.md`](docs/ADMIN.md); maintaining the Worker →
  [`worker/README.md`](worker/README.md); succession → [`docs/HANDOVER.md`](docs/HANDOVER.md).

**Health at last check (2026-08-29):** `npm test` 201/201 · `npm run build` 66
pages · `npm run check` 0/0/0 · `npm run check:dist` clean · `npm audit` 0
vulnerabilities · working tree clean. There is one dated upcoming event
(*Meet & Greet*, 2026-09-23), so the empty-calendar warning is not firing.

---

## 1. Repository map

```
content/                 CONTENT LAYER — one JSON file per entry (board's edit surface)
  events/<id>.json          9 events (8 past, 1 upcoming); filename = the event id
  members/<role>.json       6 board members; each has an `order` (1 = lead card)
  partners/<name>.json      0 partners — empty on purpose; the logo strip on
                            /partners appears as soon as there is one
src/
  pages/[...locale]/*.astro  localized routes (index, about, events, members, exchange,
                            partners, join, contact, buddy) — rest param emits both
                            /events and /de/events; 66 pages total
  pages/[...locale]/buddy/   check-email, confirmed, pair, removed (the buddy flow)
  pages/404.astro           not-found page (not localized)
  pages/events.xml.js       RSS feed at /events.xml (build-time, non-localized)
  pages/events/[id].ics.js  one real .ics file per dated event (build-time)
  components/*.astro        EventCard, EmptyUpcoming, MemberLead, MemberRow, Portrait,
                            PageToc, Header, Footer
  layouts/BaseLayout.astro  single source of <head> (canonical + hreflang) + chrome + script
  i18n/                     locale registry (config.js), t()/fallback (utils.js), {en,de,
                            hr,bs,sr}.json dictionaries; en.json is the source of truth
  lib/                      build-time logic (framework-free, no Astro imports)
    content.js                loads + validates every content file (the choke point)
    schema.js                 Zod schemas = authoritative shape of the edit surface
    events.js                 upcoming/past split, date/time formatting, eventJsonLd,
                              icsCalendar, eventRssItem
    members.js                display-name / placeholder / initial helpers
    images.js                 resolveImage(): path -> optimized asset
    buddy/                    match.js (planMatches — pure, seeded), schema.js (Zod signup),
                              tokens.js (Web Crypto), emails.js (3 localised mails + Resend)
    translate/                ISOMORPHIC — imported by BOTH the CLIs and the Worker, so no
                              node: imports, no fs, no process (see CLAUDE.md)
      glossary.js               THE translation policy: protected names, pinned terms, variants
      deepl.js                  one request per string + `context`; free/pro endpoint split
      validate.js               the gate — nothing is written until it passes
      content.js                ONE answer to "does this need translating?"
      flat.js                   flat <-> nested dictionary conversion
  images/                   source images (go through sharp -> WebP at build)
  styles/global.css        one stylesheet; all design tokens in :root at the top
worker/                  SERVER LAYER — runs only on /admin/api/* and /buddy/api/*
  index.js                 routing + Access gate; dispatches admin + buddy handlers
  collections.js           THE description of the admin form (fields, slugs, carry)
  github.js                Git Data API: one atomic commit per save  (UNTESTED)
  access.js / board-access.js  Access JWT read + the board's own email allow-list
  translate.js             DeepL key (KV over secret), per-entry state, translateEntry()
  buddy.js                 /buddy/api/* (public, token-authed) + /admin/api/buddy/* (Access)
  buddy-store.js           every D1 query, behind named methods  (UNTESTED I/O layer)
  migrations/0001_buddy.sql  signups, rounds, pairs
  lib.js                   slugify, coerceField, buildEntry, image paths
  *.test.js                node:test — form↔schema parity, carry, lockout rails,
                           translate-on-save, buddy handlers against a fake store
  README.md                maintainer reference — read before touching worker/
public/                    copied verbatim into dist/
  admin/                   the admin panel (first-party, no framework; form from the API)
  _headers                 CSP + cache rules; scoped /admin CSP; /_astro immutable;
                           text/calendar for /events/*.ics
scripts/check-dist.mjs     npm `check:dist`: post-build CSP, brand, Serbian-is-Latin,
                           /admin first-party + media checks
scripts/mirror-media.mjs   npm `prebuild`: mirrors src/images -> public/images (for /admin)
scripts/translate*.mjs     npm `translate` / `translate:content`: offline DeepL fills (not in build)
.github/workflows/ci.yml   test + build + check + check:dist + non-blocking `npm audit`,
                           on PRs to main AND pushes to main; `workflow_dispatch` enabled
astro.config.mjs           site, build.format:'file', sitemap, and the two settings that
                           keep the CSP inline-free (inlineStylesheets:'never', assetsInlineLimit:0)
wrangler.jsonc             Cloudflare: assets.directory=./dist, run_worker_first, the
                           ADMIN_SETTINGS KV, the BUDDY_DB D1 binding, the nightly cron
```

**Load-bearing rules** (full list in `CLAUDE.md`): pages import content only via
`lib/content.js`; JSON image paths are relative to `src/`; internal links are
extensionless; events are never marked "past" by hand; shared chrome lives once in
`BaseLayout.astro`; `src/lib/translate/` must stay isomorphic; the CSP carries no
`'unsafe-inline'` and `check:dist` enforces it; layout/motion changes need a real
browser pass at the widths their breakpoints name, in a long-label locale.

---

## 2. Open — human actions ⏳

Account / dashboard steps. The code is in place; these need a person.

- [ ] **Finish turning on the buddy system.** The code landed on `main` via
      #75–#77 and the D1 database is created and bound (`wrangler.jsonc` has a
      real `database_id`). Still to do — full recipe in
      [`worker/README.md`](worker/README.md) → "The buddy system":
  1. **Apply the schema to production D1** (verify it was run, or run it):
     `npx wrangler d1 migrations apply yunited-buddy --remote`. Until this is
     done `/buddy/api/*` errors in production even though the binding resolves.
  2. **Set the Resend key** and add its SPF/DKIM records for `yunited.ch`:
     `npx wrangler secret put RESEND_API_KEY`. Free tier (100/day, 3,000/month)
     covers the club. Signups still work with no key — the board confirms people
     by hand from the Buddy tab — but no round email goes out until it is set.
     Ideally the Resend account is on `yunited@shsg.ch`, not a personal address.
  3. Once live: decide the **round cadence** (assume term-start + one straggler
     round) and whether the optional **UniClubs member-list cross-check** is
     worth doing (export a CSV each term).
  - **Before announcing `/buddy` widely**, close the signup-abuse gap in §4.

- [ ] **Add the 26/27 events as dates are set** — 🧑 board, in `/admin`. Only one
      dated upcoming event exists right now (*Meet & Greet*, 2026-09-23); the
      calendar is thin for the year. The build warns whenever no upcoming event
      has a date, so a fully empty calendar cannot go unnoticed again.

- [ ] **A standing "grab a coffee & talk" meetup** — 🧑 board; venue and cadence
      to decide. It can go up **now** as a TBA-dated event (floats to the top of
      Upcoming) so the events page has a recurring low-effort draw while the term
      is still being planned; fill the date in once the cadence is settled. Open
      questions: which café near campus takes a group without a booking, and how
      often (fortnightly/monthly is easier to sustain and promote than weekly).

- [ ] **Brand the Cloudflare Access login screen** — 🧑 human-led, dashboard-only,
      no code and no deploy. Right now a board member opening `/admin` first sees
      a generic Cloudflare sign-in page on a `cloudflareaccess.com` domain, which
      reads as phishing. Zero Trust → Reusable components → Custom pages → Access
      login page → Manage: set organization name, logo, header/footer, background.
      Logo URL: `https://yunited.ch/assets/icon-512.png` (the red "yu" tile —
      carries its own background, so it survives any background colour; `/assets/*`
      is served from `dist/` and is not immutable, so replacing it later
      propagates within a day). Background/text tokens: `--color-paper #f4ecdd`,
      `--color-red #b3202c`. Settings are account-wide (fine — this account fronts
      only YUnited). Docs:
      <https://developers.cloudflare.com/cloudflare-one/reusable-components/custom-pages/access-login-page/>

- [ ] **Turn on GitHub Actions failure notifications** for the repo/org. `main`
      can now be re-checked on demand (`workflow_dispatch` + `gh workflow run
      ci.yml`), but a failed run on `main` — e.g. a hosted-runner outage — still
      notifies nobody. This is a GitHub account setting, not a file here.

- [ ] **Issue the club's keys from a club-owned identity** (`yunited@shsg.ch`),
      not a personal account: `DEEPL_API_KEY`, `GITHUB_TOKEN`, `CF_API_TOKEN`,
      and the Resend key above. Then a handover is a password change instead of a
      re-issue. See [`docs/HANDOVER.md`](docs/HANDOVER.md).

_On demand (not a task): board members add/remove each other in the `Access` tab
at `/admin`; a change takes effect in seconds. Break-glass, if nobody can get in:
Cloudflare Zero Trust → Access → Groups → `yunited-board` (steps in
[`docs/ADMIN.md`](docs/ADMIN.md))._

---

## 3. Roadmap 🗺️

Status: `[ ]` not started · `[~]` in progress. Items tagged **🧑 human-led** carry
a design decision and must NOT be auto-implemented by the weekly agent (§6).

Almost every roadmap item is done (see [`PLAN-ARCHIVE.md`](PLAN-ARCHIVE.md) §4).
What remains:

- [~] **Partners / recruiting funnel** — 🧑 human-led *(content + feature)*.
      **Done:** the `/partners` pitch page (localized, linked from nav + footer),
      an empty `content/partners/` collection, and a logo strip that renders only
      once there is a partner — so the first real partner is an `/admin` save, not
      a code change. **Remaining:** the *recruiting funnel* half — attracting new
      student members. Needs the board to define what it is before any code (a
      join form? a mailing list? an Instagram-driven signup?). The cheapest real
      version adds a "Join / Membership" topic to the existing Formspree contact
      form plus a CTA on `/join` — no new backend, no new dependency. Prefer that
      unless the board wants something the static architecture genuinely can't do.
      The `/partners` copy and nav placement are a first pass, not board-reviewed.

---

## 4. Improvement ideas 💡

Not agreed work — the weekly agent (§6) may propose *into* this section, never
implement *from* it. Roughly ordered by impact ÷ effort.

- **Close the buddy-signup abuse gap** *(real weakness, S–M).*
  `POST /buddy/api/signup` (`worker/buddy.js`) is public and unauthenticated: it
  inserts a D1 row and fires a Resend email per call. Present defences: a honeypot
  (`website`) field, same-email updates instead of duplicating, an
  email-verification gate before "active", and a 14-day purge of unverified rows.
  Gap: distinct fake emails past the honeypot are unbounded — a script can exhaust
  the Resend 100/day quota (blocking real verification mail) and grow D1 for up to
  14 days. Cheapest fix: a per-IP throttle in the Worker. Stronger: Turnstile
  (there is a `turnstile-spin` skill). **Do this before `/buddy` is announced widely.**

- **Test `worker/github.js` and `worker/buddy-store.js`** *(M).* Both are untested
  I/O layers. `github.js` (194 lines) is what makes `/admin`'s "nothing was
  changed on failure" promise true — the save is one atomic ref update at the end.
  `buddy-store.js` is new and now handles private student data. Approach:
  `node:test` with an injected `fetch` / D1 stub; assert the blob→tree→commit→ref
  order, that the ref update is **not** forced, and that `remove:true` emits a
  tree entry with a null sha. No network, per `CLAUDE.md`. Touches `worker/**`, so
  human review either way (§6).

- **Fill the 7 English-fallback i18n keys** *(S).* `skipLink`,
  `events.emptyUpcomingEyebrow/Heading/Body/Instagram/Uniclubs`, and
  `events.addToCalendar` are missing in de/hr/bs/sr and render in English. The
  `emptyUpcoming` ones are shown on `/events` whenever the calendar is bare, so
  non-English visitors see English on that page. Run `npm run translate` (needs
  `DEEPL_API_KEY` in a gitignored `.env`; pass `de` explicitly — it is
  hand-reviewed), read the review report, commit the JSON. `buddy.*` keys are
  already fully translated.

- **Surface untranslated keys in CI** *(S).* The 7 keys above have survived ~5
  PRs because the fix needs a key and a review pass and keeps being deferred. A
  non-failing `check:dist` (or CI) warning listing every key identical to English
  in a `complete: true` locale would make the debt visible on every PR. English
  fallback is legitimate mid-work — so a warning, not an error.

- **Decide the "casino nights" wording in `events.heroLede`** *(S, board
  decision).* #71/#73 changed "casino nights" → "adventures"/"avanture"/"Abenteuer"
  on `/join` but not `/events`. `events.heroLede` still says "casino
  nights"/"casino večeri" in en/hr/bs/sr (de lacks the key). Pick a word, update
  all five, mirror the #71/#73 edits.

- **Scope `validate.js`'s `forbidden` stems per language** *(S).* Running the
  translation gate against committed `de.json` surfaces ~13 false positives: the
  `buddy-` forbidden stem (written for hr/bs/sr) matches German's own accepted
  loanword "Buddy-System". Scope `forbidden` per language the way `canonical`
  already is. Separately, a real finding to hand the board:
  `movie-night-svadba-2026.json`'s German title translated `Svadba` (a protected
  film name) to "Die Hochzeit".

- **A phone-width pass on `/admin` and `/buddy/pair`** *(S).* Neither has been
  rendered at the 33rem breakpoint. `/admin` is board-facing; `/buddy/pair` is
  tapped by students from an email link and just had a rendering bug fixed (#77).
  One deliberate look at 375px in a long-label locale (hr/bs *kumstvo* pages).

- **Prune stale remote branches** *(S).* ~15 `origin/*` branches, every one
  already squash-merged (verified: `main` is ahead of all three `buddy-*`
  branches on every file; the rest are single pre-squash PR commits). Safe to
  `git push origin --delete`.

- **A "what's on" nudge when the calendar empties** *(M, only if it recurs).* The
  build warns when no upcoming event has a date, but only a developer running a
  build sees it. If the empty-calendar problem comes back, surface it where the
  board will see it rather than warning harder in the terminal.

- **Turnstile on the contact form** *(deferred deliberately, 2026-07-29).* The
  form's only spam defence is a honeypot. Left as is — a third-party script on a
  CSP this clean is not worth it until spam actually appears. Revisit if the club
  inbox fills up or Formspree's quota is exhausted. (If the buddy-signup item
  above brings Turnstile in anyway, reconsider adding it here in the same pass.)

---

## 5. Everyday commands

```bash
npm install        # once
npm run dev        # local preview at http://localhost:4321
npm test           # unit tests for src/lib + worker/ (node:test, no framework)
npm run build      # writes dist/ (runs prebuild: mirrors src/images)
npm run check      # astro check — must be 0 errors AND 0 hints
npm run check:dist # post-build: CSP-inline-free + brand spelling + Serbian-Latin
npm run preview    # serve built dist/
npm run admin:dev  # wrangler dev — /admin + its Worker on :8787
```

"Verified" = all four of `test`, `build`, `check`, `check:dist` pass — exactly
what CI runs — and, for content/render changes, the expected text appears in the
built HTML (e.g. `grep "Meet & Greet" dist/events.html`). For layout/CSS changes
that is **not enough** — none of the four renders a page; do a browser pass at the
widths the breakpoints name, in a long-label locale (hr/bs). See `CLAUDE.md`.

---

## 6. Automation 🤖

A **weekly cloud agent** ("YUnited weekly roadmap agent") runs every **Monday
09:00 Europe/Zurich** (`0 7 * * 1` UTC). Manage/disable it at
<https://claude.ai/code/routines>.

Each run it takes the **first unchecked, non-🧑 item** — from §2's human actions
it skips, so effectively from §3, then §4 — implements it on a branch, moves the
entry to [`PLAN-ARCHIVE.md`](PLAN-ARCHIVE.md), opens a PR, verifies with
`npm ci` + `test` + `build` + `check` + `check:dist`, reviews its own diff, and
**auto-merges only if CI passes and nothing is contentious**. If §3 and §4 are
both clear it switches to proposing ideas into §4 (and does not merge that PR).

**It will never auto-merge a change touching** `public/_headers`,
`public/admin/**`, `worker/**`, `.github/workflows/**`, `wrangler.jsonc`,
`astro.config.mjs`, `src/lib/schema.js`, dependency files, or any deletion/rename
under `content/` — those it leaves open for a human. It never pushes to `main`,
never weakens CI, a test, `check:dist` or the schema to go green (the fix for a
red build is the code that made it red, never the assertion), and does one item
per run.

> **Keep this file accurate.** The agent decides what to do from §3/§4, so a
> stale entry means it redoes finished work or skips real work. Completed items
> move to the archive — they do not get a `[x]` and stay here.
