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

**Health at last check (2026-09-06):** `npm test` 217/217 · `npm run build` 66
pages · `npm run check` 0/0/0 · `npm run check:dist` clean · `npm audit` 0
vulnerabilities · working tree clean. Four dated upcoming events (*Meet & Greet*
2026-09-23, *Game Night* 2026-10-07, *Karaoke* 2026-11-12, *Christmas Dinner*
2026-12-09), so the empty-calendar warning is not firing; spring 2027 is still
thin.

---

## 1. Repository map

```
content/                 CONTENT LAYER — one JSON file per entry (board's edit surface)
  events/<id>.json          12 events (8 past, 4 upcoming); filename = the event id
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
  components/*.astro        EventCard, UpcomingEvent (home expanding poster + OSM
                            mini-map), EmptyUpcoming, MemberLead, MemberRow,
                            Portrait, PageToc, Header (desktop "More" disclosure), Footer
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
  1. ~~**Apply the schema to production D1**~~ ✅ done — `npx wrangler d1 migrations apply yunited-buddy --remote` confirmed clean.
  2. ~~**Set the Resend key** and add its SPF/DKIM records for `yunited.ch`~~ ✅ done — `RESEND_API_KEY` set.
  3. **Set the Turnstile secret** to activate the signup-abuse protection: create
     a widget at Cloudflare dashboard → Turnstile → Add site (Managed mode,
     `yunited.ch`), then `npx wrangler secret put TURNSTILE_SECRET_KEY`. The
     public site key is baked into `buddy.astro` as the default (#88), so no
     Workers Build env var is needed unless it changes. Without the secret the
     widget renders but the token is never verified — a known safe fallback.
     Full recipe in `worker/README.md` → "The buddy system" → "One-time setup" step 3.
  4. Once live: decide the **round cadence** (assume term-start + one straggler
     round) and whether the optional **UniClubs member-list cross-check** is
     worth doing (export a CSV each term).

- [ ] **Add the spring-2027 events as dates are set** — 🧑 board, in `/admin`.
      Autumn 2026 now has four dated events (*Meet & Greet*, *Game Night*,
      *Karaoke*, *Christmas Dinner*), but nothing is on the calendar past
      2026-12-09. The build warns whenever no upcoming event has a date, so a
      fully empty calendar cannot go unnoticed again.

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
      `RESEND_API_KEY` and `TURNSTILE_SECRET_KEY`. Then a handover is a password
      change instead of a re-issue. See [`docs/HANDOVER.md`](docs/HANDOVER.md).

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

- **Test `worker/github.js` and `worker/buddy-store.js`** *(M).* Both are untested
  I/O layers. `github.js` (194 lines) is what makes `/admin`'s "nothing was
  changed on failure" promise true — the save is one atomic ref update at the end.
  `buddy-store.js` is new and now handles private student data. Approach:
  `node:test` with an injected `fetch` / D1 stub; assert the blob→tree→commit→ref
  order, that the ref update is **not** forced, and that `remove:true` emits a
  tree entry with a null sha. No network, per `CLAUDE.md`. Touches `worker/**`, so
  human review either way (§6).

- **Surface untranslated keys in CI** *(S).* A
  non-failing `check:dist` (or CI) warning listing every key identical to English
  in a `complete: true` locale would make the debt visible on every PR. English
  fallback is legitimate mid-work — so a warning, not an error.

- **Decide the "casino nights" wording in `events.heroLede`** *(S, board
  decision).* #71/#73 changed "casino nights" → "adventures"/"avanture"/"Abenteuer"
  on `/join` but not `/events`. `events.heroLede` still says "casino
  nights"/"casino večeri"/"Casino-Abende" in all five locales. Pick a word,
  update all five, mirror the #71/#73 edits.

- **A phone-width pass on `/admin` and `/buddy/pair`** *(S).* Neither has been
  rendered at the 33rem breakpoint. `/admin` is board-facing; `/buddy/pair` is
  tapped by students from an email link and just had a rendering bug fixed (#77).
  One deliberate look at 375px in a long-label locale (hr/bs *kumstvo* pages).

- **Unit-test `src/lib/members.js`** *(S).* `events.js` carries the same class of
  build-time logic (date parsing, TBA handling, placeholder detection) and is
  unit-tested per `CLAUDE.md`'s own rule for this repo — "get the ... boundary
  wrong ... and every command still passes while the site shows the wrong
  thing" — but `members.js` (`isUnfilled`, `displayName`, `initialOf`) has no
  test file at all. The placeholder regex (`/\[.*?\]/`) and the
  empty/whitespace-name fallback in `initialOf` are exactly the edge case that
  could ship a literal `"[PLACEHOLDER: Full Name]"` or a bare `"?"` initial to a
  live member card without failing `test`, `build`, `check` or `check:dist`.

- **Unit-test `verifyAccessJwt` in `worker/access.js`** *(M).* It is the sole
  authorization gate for every `/admin/api/*` route (save, delete, the Access
  allow-list, the Buddy admin endpoints) and has zero test coverage today —
  `access.test.js` doesn't exist, unlike its sibling `board-access.test.js`.
  Its branches (wrong issuer, wrong audience, expired, unknown `kid`, bad
  signature) are independently checkable with `node:test`: mint a real RSA
  keypair with the Web Crypto global (available in Node), sign a fake JWT with
  it, and stub `fetch` to return a matching JWKS — no network, per `CLAUDE.md`.
  Touches `worker/**`, so human review either way (§6).

- **An internal-link integrity check in `check:dist`** *(M).* Nothing today
  crawls the built `dist/**/*.html` for internal `<a href>` targets or hreflang
  links that don't resolve to a real file — a `localizePath` typo or a renamed
  route would only surface as a live 404 a visitor actually hits. `check-dist.mjs`
  already walks every page for CSP/brand/image checks; extending it to collect
  internal hrefs per page and assert the target exists under `dist/` needs no
  new dependency and runs in the same CI pass.

- **A "what's on" nudge when the calendar empties** *(M, only if it recurs).* The
  build warns when no upcoming event has a date, but only a developer running a
  build sees it. If the empty-calendar problem comes back, surface it where the
  board will see it rather than warning harder in the terminal.

- **Turnstile on the contact form** *(deferred deliberately, 2026-07-29).* The
  form's only spam defence is a honeypot. Left as is — a third-party script on a
  CSP this clean is not worth it until spam actually appears. Revisit if the club
  inbox fills up or Formspree's quota is exhausted. (If the buddy-signup item
  above brings Turnstile in anyway, reconsider adding it here in the same pass.)

- **Add a `Strict-Transport-Security` header** *(S).* `public/_headers`' global
  `/*` block sets `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy` and `Permissions-Policy`, but no HSTS header at all —
  checked, it is not there. Nothing else supplies it either: the site is a
  Cloudflare Worker serving static assets directly, not behind the Pages HTTPS
  proxy layer that sometimes adds this on its own, so a client that has never
  visited `yunited.ch` before has no reason to skip a plaintext first request.
  Add `Strict-Transport-Security: max-age=63072000; includeSubDomains;
  preload` to the `/*` block; `check:dist` would need no change. Touches
  `public/_headers`, so human review either way (§6). Submitting the domain at
  hstspreload.org is then a separate, human, one-time step.

- **Unit-test `localizeEntry` in `src/lib/content.js`** *(S).* It is exactly
  the class of build-time logic `CLAUDE.md` singles out for testing — get its
  field-by-field fallback wrong and every command still passes while a page
  quietly shows English text under a `hr`/`bs`/`sr` URL, or drops a field
  entirely — yet it has no test file and isn't exercised by `events.test.js`
  either (checked). Worth covering explicitly: a partially-translated entry
  falls back per field rather than all-or-nothing; a translated field that is
  an empty string or whitespace-only does *not* overwrite the source text; and
  an entry with no matching `i18n[dict]` is returned unchanged. Pure function,
  no `import.meta.glob` needed to reach it — a plain object literal exercises
  it directly.

- **Guard the case-collision in `src/lib/images.js`'s image lookup** *(S).*
  `resolveImage`'s lookup `Map` is keyed by the *lowercased* path so that
  `IMG_1234.PNG` resolves like `img_1234.png` — deliberate, per the comment at
  the top of the file. The gap: if two distinct files in `src/images/` differ
  only by case (e.g. a board member re-uploads `Photo.jpg` next to an existing
  `photo.jpg`), `import.meta.glob`'s enumeration order silently decides which
  one every reference resolves to, with no error and no warning — the build
  stays green and `check:dist` stays clean while an event or member ships the
  wrong photo. Detect the collision when building `byKey` (the two original,
  differently-cased paths are both known at that point) and throw a clear
  build error naming both files, the same way a missing image already does.

- **A Playwright screenshot pass for the two known-fragile layouts** *(M).*
  `CLAUDE.md` names this exact gap repeatedly — overlap, wrapping and sticky
  behaviour are invisible to `test`, `build`, `check` and `check:dist`, so
  today it depends on a human remembering to open a browser at the named
  breakpoints in hr/bs before every layout PR (the `--toc-width` incident in
  PR #55 is the fossil record of that failing once). `/about` and
  `/buddy/pair` are the two pages CLAUDE.md and PLAN.md §4 flag as fragile —
  the TOC rail against the 17ch `hr` "Sustav/Sistem prijatelja" label, and
  the pair page at the 33rem phone breakpoint. A script that boots
  `npm run preview`, opens both pages in Playwright's pre-installed Chromium
  at the widths their breakpoints name, and diffs against a checked-in
  baseline PNG would catch a regression automatically instead of relying on
  someone doing the manual pass. Keep it non-blocking in CI at first (font
  rendering/anti-aliasing differences between machines make pixel diffs
  noisy) — a warning artifact on the PR, not a required check, until it's
  proven stable enough to gate on.

- **An accessibility smoke test against the built `dist/` pages** *(S/M).*
  Nothing in `check:dist` or CI checks accessibility today — no
  color-contrast, landmark, alt-text or ARIA check exists anywhere in the
  pipeline (checked `scripts/check-dist.mjs` and `.github/workflows/ci.yml`).
  Running `axe-core` against a handful of representative built pages (home,
  events, about, buddy sign-up) in one Node script, with Playwright's
  pre-installed Chromium loading the static HTML, would surface regressions
  like a card missing an accessible name or insufficient text contrast on
  `--color-paper`/`--color-red` combinations for free. Start non-blocking (a
  reported list, not a failing check) since a full WCAG pass isn't a goal —
  catching an accidental regression on a handful of key pages is.

- **Surface the nightly cron sweeps' health in `/admin`** *(S).* The
  translate sweep and `purgeStaleBuddySignups` (`worker/index.js`
  `scheduled`) only report through `npx wrangler tail` or the Workers
  observability logs — nobody sees an outage until a board member notices
  missing translations or a growing pile of unverified buddy signups weeks
  later, the same "nobody has an account for that surface" problem
  `CLAUDE.md` describes for the retired GitHub Actions translate workflow.
  The Translations tab already stores structured state in the
  `ADMIN_SETTINGS` KV (`worker/translate.js`); writing a small
  `{ranAt, ok, detail}` record there after each sweep (translate and buddy
  purge, one key each) and showing "last run: <time>, <ok/failed>" next to
  the existing DeepL key status would close that gap with the storage
  mechanism the panel already has, not a new one.

- **Preload the hero's critical webfonts to cut the FOIT/LCP flash** *(S).*
  `Fraunces`, `Newsreader` and `Space Mono` are already self-hosted under
  `assets/fonts/` (moved off `fonts.gstatic.com` for FADP/GDPR, per the
  comment at the top of `global.css`), each split into `latin` /
  `latin-ext` subsets with `font-display: swap` — but nothing `<link
  rel="preload">`s any of them (checked: no `rel="preload"` anywhere in
  `src`). The hero `<h1>` is the page's largest text block and, on most
  pages, its LCP candidate; today it paints in a fallback serif, then
  reflows into Fraunces once the CSS file is parsed and the font request
  starts — a flash that preloading the one weight/subset the hero actually
  needs would remove. `BaseLayout.astro` already knows the active locale
  at render time, so the preload can pick `latin` vs `latin-ext` per page
  rather than shipping both unconditionally (which would trade the flash
  for extra bytes on every load). Worth confirming the win in a Lighthouse
  trace before committing to it — self-hosted `font-display: swap` may
  already be small enough that this is not worth the added `<head>` weight.

- **Flag images in `src/images/` that nothing references** *(S/M).* The
  build already fails loudly on the opposite mistake — a content entry
  naming an image that does not exist (`src/lib/images.js` throws) — but
  there is no check the other way: a photo left behind after an event's
  entry is deleted by hand, or an upload that never got wired into a JSON
  file, sits in the tree (and gets mirrored to `public/images/` by
  `scripts/mirror-media.mjs` for `/admin`) forever, silently growing the
  repo and the admin thumbnail list. A script — run alongside
  `check:dist` — that collects every `images/…` string referenced from
  `content/**/*.json` plus every `images/…` path imported directly by a
  `.astro`/`.js` file (hero art, icons, OG image, portraits not tied to a
  member entry) and diffs that set against `import.meta.glob("src/images/**")`
  would catch the drift. False positives are the risk to design out before
  landing this: anything referenced only through a dynamic path (there
  should be none today, but worth grepping for) would need an explicit
  allow-list entry rather than a permanent false alarm.

- **A non-blocking external-link liveness check in CI** *(M).* `check:dist`
  verifies every internal image and (per the internal-link-integrity idea
  above, once built) every internal href, but nothing checks the handful
  of external URLs the site depends on for real: each upcoming event's
  `rsvpUrl` (an Eventbrite/Google Form link a board member typed by hand —
  the RSVP button on a live event pointing at a 404 is the one broken link
  a visitor would actually hit), plus the hardcoded social links in
  `Footer.astro` and `EmptyUpcoming.astro` (Instagram, LinkedIn,
  `uniclubs.ch`). A small script hitting each with `HEAD` (falling back to
  `GET` where a host rejects `HEAD`) and reporting non-2xx/3xx as a
  warning — never a failing check, since an external host's transient
  hiccup is not this repo's bug to block a merge over — would surface link
  rot that otherwise waits for a student to click it. Keep it out of
  `npm test` (which is deliberately network-free per `CLAUDE.md`); run it
  as its own `npm run check:links`, non-blocking in CI, perhaps only on a
  schedule rather than every PR so a flaky third-party host doesn't add
  noise to unrelated diffs.

- **Track Core Web Vitals in CI as a non-blocking artifact** *(M).*
  Playwright's Chromium is already pre-installed for the (still proposed)
  screenshot-diff and axe-core ideas above, and it exposes the same
  `PerformanceNavigationTiming`/paint-timing entries a Lighthouse run
  would, via `page.evaluate(() => performance.getEntriesByType(...))`
  against `npm run preview` — no new dependency, unlike adding `lighthouse`
  itself. Recording LCP/CLS/TBB-ish timing for the home page and one
  content-heavy page (`/events`) on every PR as a non-blocking artifact
  would make a regression (an unbudgeted third-party script, an
  unoptimized image, a font added without `font-display: swap`) visible
  in review instead of only noticeable to a visitor on a slow connection.
  Start non-blocking, the same caveat as the a11y/screenshot ideas above —
  machine-to-machine timing noise makes a hard gate premature until the
  numbers are watched for a few weeks first.

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
