# PLAN-ARCHIVE.md — YUnited website: completed work & history

> **This is the archive.** It holds the dated status notes, the table of shipped
> PRs, and the full write-ups of every roadmap / tech-debt item that is **done**.
> It was split out of `PLAN.md` on **2026-08-29** so the live tracker holds only
> open work. Nothing here is a to-do. Section numbers (§1–§7) are preserved
> because code comments and older notes cite them (e.g. "PLAN.md §4"); those
> references now resolve here.
>
> The live tracker — open human actions, the remaining roadmap, improvement
> ideas — is **[`PLAN.md`](PLAN.md)**. When a task in `PLAN.md` ships, move its
> entry here in the same PR.
>
> **Everything below is the state of `PLAN.md` as of 2026-08-29** (commit
> `ef13334`, just after the buddy system landed via #75–#77), verbatim, for the
> record.

---

## Shipped after the split

**2026-08-30 — Buddy-signup Turnstile abuse protection (branch `vk/8fb7-close-the-buddy`)**

Closed the signup-abuse gap from `PLAN.md` §4. `POST /buddy/api/signup` was
unbounded on distinct fake emails — a script could exhaust Resend's 100/day
quota and grow D1 for up to 14 days. Fixed with Cloudflare Turnstile:

- `worker/buddy.js`: `defaultVerifyTurnstile` + server-side check in `signup()`
  gated on `env.TURNSTILE_SECRET_KEY`; injected via `deps` for testability.
- `src/pages/[...locale]/buddy.astro`: `<div class="cf-turnstile">` widget in
  the form; Turnstile script injected dynamically from the bundled `<script>`
  (avoids `is:inline`, keeps HTML source clean, CSP stays tight).
- `public/_headers`: added `https://challenges.cloudflare.com` to `script-src`
  and `frame-src` in the global `/*` rule.
- `worker/buddy.test.js`: 3 new tests (skip without secret, pass, reject).
- `worker/README.md` step 3, `.env.example`, `wrangler.jsonc`, `docs/domains/buddy.md`: all updated.
- **Human action still needed**: create Turnstile widget at Cloudflare dashboard,
  `wrangler secret put TURNSTILE_SECRET_KEY`, set `PUBLIC_TURNSTILE_SITE_KEY` in
  Workers Build env. Without the secret the check is skipped (safe fallback).

**2026-08-30 — Fill the 7 English-fallback i18n keys**

`skipLink`, `events.emptyUpcomingEyebrow/Heading/Body/Instagram/Uniclubs`, and
`events.addToCalendar` were missing in de/hr/bs/sr and fell back to English. Filled
manually following the glossary policy (Swiss ss/no-ß for de; Ijekavian + Croatian
lexis for hr; Ijekavian + Bosnian lexis for bs; Ekavian Latin for sr). `npm test`
201/201, `npm run build` 66 pages, `npm run check:dist` clean.

**2026-08-30 — Scope `validate.js`'s `forbidden` stems per language, and the
`Svadba` mistranslation (#79)**

Both closed the §4 item of the same name in the same PR that landed as #79.
`glossary.js`'s `buddy-` forbidden stem (written for hr/bs/sr) was firing
against German's own accepted loanword "Buddy-System"; it moved to a new
`forbiddenIn: { hr, bs, sr }` field, and `validate.js` now merges
`term.forbidden` with `term.forbiddenIn[code]` per language. The "no canonical
forbidden" integrity test was extended to check `forbiddenIn[code]` too. The
`movie-night-svadba-2026.json` German title the item flagged as translating
`Svadba` (a protected film name) to "Die Hochzeit" is also no longer an issue —
it reads `"Filmabend – Svadba"`, confirmed on `main` at 2026-08-31.

**2026-08-31 (no code changed) — "Prune stale remote branches" removed as
moot**

The §4 item assumed ~15 squash-merged `origin/*` branches were still sitting on
the remote. Checked while picking this run's roadmap item: `git branch -r` on
`main` at `3ddb9ef` shows only `origin/main` and the current run's own working
branch — nothing left to prune. Whatever pruned them (a manual cleanup, or the
`/cleanup` slash command added in #87) already happened; removed rather than
re-proposed.

---

# PLAN.md — YUnited website: status, structure & roadmap

**Purpose.** One living document to see at a glance what the repo *is*, what's
**done**, what's **pending**, and what's **planned** — so neither the board nor an
AI assistant has to re-derive the layout by scanning every time. Keep it current:
when a step ships, tick it here in the same PR.

- **What this is:** the static website for **YUnited**, the Balkan / ex-Yu student
  club at the University of St. Gallen (HSG), served at **yunited.ch**.
- **Stack:** [Astro](https://astro.build) (build-time rendering) → static files →
  **Cloudflare Workers** static assets. No database, no server, no runtime JS data.
- **Deeper docs:** architecture & conventions → [`CLAUDE.md`](CLAUDE.md); using the
  admin panel → [`docs/ADMIN.md`](docs/ADMIN.md); maintaining it →
  [`worker/README.md`](worker/README.md). This file is the *tracker/index*; those
  are the *reference*.

_2026-08-24 (weekly agent): picked §4's **"Add to calendar" (.ics) link**, the
first unchecked, non-🧑, non-`[~]` item in order (everything above it, including
the partners item, is `[x]` or `[~]`). See §4 for the full entry. All four
verification commands green — `npm test` 143/143, `build` 41 pages, `check`
0/0/0, `check:dist`. **The next unchecked, non-🧑 item is now the
skip-to-content link**, followed by the events RSS feed and the Formspree
`preconnect` — the sentence two paragraphs down naming the .ics link as "next"
is superseded by this line._

_2026-08-23 (documentation sync — no code changed): brought `PLAN.md`,
`README.md`, `CLAUDE.md`, `docs/HANDOVER.md` and `worker/README.md` back in line
with `main` at `1e73454`, two PRs past where this pass started (`d19a236`):
**#63** dropped the semester fee to CHF 15 — the change this note originally
flagged as still-uncommitted landed under its own PR while this sync was in
flight — and **#64** fixed the mobile events grid and added a real empty state.
**All four verification commands green:** see the line below for the numbers
from this pass. Six things the `d19a236` half of this pass established, still
true. **(1) §3's two out-of-band steps are both DONE** — `npx wrangler secret
list` returns `GITHUB_TOKEN`, `CF_API_TOKEN` **and `DEEPL_API_KEY`**, and the
`ADMIN_SETTINGS` KV namespace exists (`ad0d3dcd…`) and is bound in
`wrangler.jsonc`. Translation therefore works in production and the board can
replace the key themselves; the item is ticked below. **(2) The store is
empty** (`wrangler kv key list` → `[]`), which is correct — with no board-set
key the secret answers, and the first paste into the Translations tab creates
`deepl.apiKey`. **(3) The deployed Worker was current as of #62**: the newest
deployment then was 2026-08-21 21:50 UTC, minutes after #62 merged; not
re-checked against #63/#64. **(4) `npm audit` drifted again, 6 → 7** (4 high, 3
moderate; `nanoid` is new) — see §5, where the finding is still the silence
rather than the CVEs. **(5) The empty-calendar warning is still firing**,
correctly: the newest dated event is 2026-05-13 and Upcoming is one TBA card —
though `/events` and `/` no longer show that as a bare warning; #64's
`EmptyUpcoming.astro` gives it a real lead-slot card. **(6) Six merged PRs had
never been logged in §2** — #54, #59+#61, #60, #62, #63 and #64 — now added.

**What is actually open, in one place.** §3 has **one** live item and it is a
board decision: the 26/27 calendar. §4's next unchecked, non-🧑 item — i.e. the
one the weekly agent picks up — is the **"add to calendar" (.ics) link**,
followed by the skip-to-content link, the events RSS feed and the Formspree
`preconnect`. §5 has the two "assertions nobody delivers to a person" items: the
`npm audit` drift and a red CI run on `main` telling nobody. Two loose ends sit
inside otherwise-closed items: **`/admin` has still never been looked at on a
phone** (the 33rem breakpoint), and **#64's four `EmptyUpcoming` i18n keys have
no hr/bs/sr/de translation yet** (no `ANTHROPIC_API_KEY`/`DEEPL_API_KEY` in that
session) — they fall back to English until a maintainer runs `npm run
translate`._

_2026-08-17 (weekly agent): picked §4's **"Translation runs on DeepL's free
tier"** item — the first unchecked, non-human-led item in order (the partners
item above it is `[~]`, not `[ ]`, and everything else in §4 was already done
or 🧑 human-led). Implemented stages 1/3/4/5 of the item's own plan: restored
`scripts/lib/deepl.mjs` from the commit before #50 deleted it, rewired
`translate.mjs`/`translate-content.mjs` to call it instead of the deleted
`claude.mjs`, updated `.github/workflows/translate-content.yml` and
`.env.example`/`README.md`/`CLAUDE.md` from `ANTHROPIC_API_KEY` to
`DEEPL_API_KEY`, and dropped `@anthropic-ai/sdk`. **Stage 6 (a live `--force`
run diffed against the committed hr/bs/sr, and a real `/admin` save through
the workflow) could not run**: this environment has no `DEEPL_API_KEY`, so the
actual DeepL HTTP call is unexercised — everything network-independent was
verified instead (`npm test` 94/94 — 12 new cases for `deepl.mjs`'s pure
functions, `toSerbianLatin` unit-tested for the first time — `npm run build`
41 pages, `check` 0/0/0, `check:dist`, and `npm run translate -- --dry-run` /
`translate:content -- --dry-run`, both of which need no key and wrote
nothing). Full details, and one finding worth a human's attention (running the
unchanged `validate.mjs` gate against the *currently committed* `de.json`
surfaces 15 pre-existing errors, `hr`/`bs`/`sr` are clean), are in the PR. Left
open per §7 — touches `.github/workflows/**` and a dependency file, so it was
never going to auto-merge regardless of how stage 6 turns out._

_Last updated: 2026-08-06 (status review. 0 open issues, 0 `TODO`/`FIXME` in
source, and all four verification commands green — `npm test` 82/82, `build`
(41 pages), `check` at 0/0/0, `check:dist`. #37–#51 landed 2026-07-28 → 07-30:
all five locales live, Astro 7 / Zod 4 / TS 6, the guardrail suite, the empty
partners collection, Sveltia replaced by the first-party `/admin` + Worker, the
motif/reveal motion fixes, the translation pipeline rebuilt with bs split from
hr, and the board's own Access allow-list._

_2026-08-07 (catch-up review — no code changed). All four commands verified green
locally on `a822588`: `npm test` 82/82, `build` 41 pages, `check` 0/0/0,
`check:dist`. Three things this run established. (1) **The DeepL item's blocking
Stage 0 is answered** — see §4; `BS` now exists as a DeepL target, which deletes
a whole stage, and glossaries turned out **not** to cover en→hr/bs/sr, which is
the one answer that went against the plan. **The board chose DeepL over the
hand-translation fallback (Option B), 2026-08-07.** (2) **GitHub's hosted runners
failed on 2026-08-06** — the last CI run on `main` died with *"the job was not
acquired by Runner of type hosted"* and the merges of #52/#53 produced no runs at
all. The runners are working again, but **no CI run has ever validated `a822588`**;
the next PR will be the first. Nothing was wrong with the code — the local run
proves that — and the real finding is that **a failed run on `main` notifies
nobody**, which is the same shape as the audit drift below and the empty-calendar
warning nobody sees. (3) `npm audit` drifted **again**, in a single day: 5 → 6._

_2026-08-03 (weekly agent, ideate mode — no code changed): every remaining §4/§5
checkbox was either done or 🧑 human-led (the partials/tab-brand items), so this
run researched the live code instead of picking an item, and appended five new
`[ ]` proposals to §4 — event `Event` JSON-LD, a per-event "add to calendar" link,
a skip-to-content link, an events RSS feed, and a Formspree `preconnect` — each
scoped to what's actually missing in the current `src/`/`content/` (verified by
reading `BaseLayout.astro`, `index.astro`, `astro.config.mjs` and `package.json`
directly, not assumed). Merged 2026-08-06 after each claim was re-checked
against the code independently; all five were accurate._

_2026-08-10 (weekly agent): shipped **event `Event` JSON-LD** (§4). The next
item in order, "Translation runs on DeepL's free tier," was attempted first but
its own §4 text requires a "Stage 0" check against DeepL's *current* supported-
language list before any code is written — and that couldn't be done safely
this run: `developers.deepl.com` is unreachable from this environment's network
egress, and a web search gave unreliable, self-contradictory results (at one
point claiming Croatian isn't a supported target, which contradicts this repo's
own history of using it). Writing the derivation/rewiring code on an unverified
premise risked shipping something wrong, so it was left for a run — or a human —
that can actually reach DeepL's docs/API first. Picked the next eligible item
instead. All four verification commands green — `npm test` 87/87 (82 + 5 new
`eventJsonLd` cases), `build` (41 pages), `check` at 0/0/0, `check:dist`._

_**Correction to the 2026-07-29 entry, which claimed `npm audit` was clean.** It
no longer is: **6 vulnerabilities (3 high, 3 moderate)** as of 2026-08-07 —
`undici`/`miniflare` via `wrangler` (local `admin:dev` only), `postcss` via
`astro`/`vite` (build time, over CSS authored in this repo), `fast-uri` via
`@astrojs/check` (`npm run check` only), and **`js-yaml`
(`GHSA-5p4m-2wfm-xmqj`, quadratic CPU in `!!omap`) — new on 2026-08-07**. All of
it is dev tooling: none ships to a visitor's browser or runs in the deployed
Worker, so this is not urgent — but it drifted **silently in one week**, and then
**again the very next day** (5 → 6), and it drifted because **CI runs no `npm
audit` step**, which is the actual finding. That second drift is the argument for
the CI step: two data points eight days apart, neither noticed by any command
anyone runs. `fast-uri`, `postcss` and `js-yaml` have non-breaking fixes; ignore
npm's suggestion to "fix" the wrangler chain by downgrading to 4.35.0. See §5._

_**The live items are not code — and as of 2026-08-23 there is only one left.**
(1) ~~Automatic translation is switched off~~ — **fixed.** It no longer runs in
GitHub Actions on a metered Anthropic key; an event is translated by the Worker
**inside the same commit as the board's save**, on DeepL's free tier, with a
nightly cron sweep behind it and a Translations tab the board can paste a
replacement key into. Both out-of-band steps are done and verified in production
(§3). (2) **The 26/27 calendar is still empty** — the newest dated event is
2026-05-13, so Upcoming shows one TBA card; the build warns about it and is
warning right now. **This is the one live item**, and it is a board decision, not
work anyone can do here. (3) ~~The `GITHUB_TOKEN` expires end of August 2026~~ —
**replaced 2026-08-06 with a non-expiring fine-grained PAT; no longer a
deadline.** All in §3. New ideas are parked in §4.5._

---

## 1. Repository map

```
content/                 CONTENT LAYER — one JSON file per entry (board's edit surface)
  events/<id>.json         9 events (8 dated, 1 TBA); filename = the event id
  members/<role>.json      6 board members; each has an `order` (1 = lead card)
  partners/<name>.json     0 partners — empty on purpose; the logo strip on
                           /partners appears as soon as there is one
src/
  pages/[...locale]/*.astro 8 localized routes (index, about, events, members, exchange,
                           partners, join, contact); rest param emits both /events and /de/events
  pages/404.astro          not-found page (not localized)
  components/*.astro       EventCard, MemberLead, MemberRow, Portrait, PageToc, Header, Footer
  layouts/BaseLayout.astro single source of <head> (canonical + hreflang) + chrome + script
  i18n/                    locale registry (config.js), t()/fallback (utils.js), {en,de,
                           hr,bs,sr}.json dictionaries; en.json is the source of truth
                           (bs and hr split out of a shared `bcs` file — see §2)
  lib/                     build-time logic (framework-free, no Astro imports)
    content.js               loads + validates every content file (the choke point)
    schema.js                Zod schemas = authoritative shape of the edit surface
    events.js                upcoming/past split, date/time formatting & tiebreak
    events.test.js           `npm test` — see CLAUDE.md for what gets tested and why
    members.js               display-name / placeholder / initial helpers
    images.js                resolveImage(): path -> optimized asset (any raster fmt/case)
  images/                  source images (go through sharp -> WebP at build)
    events/{25_26,26_27}/, members/
  styles/global.css        one stylesheet; all design tokens in :root at the top
worker/                  SERVER LAYER — the only code that runs at request time,
                         on /admin/api/* only (wrangler `run_worker_first`)
  index.js                 the 5 routes: GET state, POST save/delete, GET/POST access
  collections.js           THE description of the admin form (fields, slugs, carry)
  schema ← src/lib/schema.js  the same Zod schemas the site build validates with
  github.js                Git Data API: one atomic commit per save
  access.js                reads + verifies the Cloudflare Access JWT (no login code)
  board-access.js          the email allow-list: who may open /admin (membership,
                           NOT authentication — Access still does that)
  translate.js             the DeepL key (KV over secret), the per-entry state the panel
                           badges, and translateEntry() — which never throws, because a
                           translation failure must never fail a board member's save
  lib.js                   slugify, coerceField, buildEntry, image paths
  {collections,lib,board-access,translate}.test.js  `npm test` — form↔schema parity,
                           carry, coercion, lockout rails, non-destructive group writes,
                           and translate-on-save (never throws, Cyrillic rejection,
                           timeout, hand-edit merge). github.js is the one untested file
  README.md                maintainer reference — read before touching worker/
public/                    copied verbatim into dist/
  admin/                   the admin panel: index.html, admin.css, admin.js
                           (first-party, no framework; form generated from the API)
  _headers                 CSP + cache rules; scoped /admin CSP; /_astro immutable
  assets/                  logos, favicons, icons, motif, fonts/ (self-hosted woff2)
  robots.txt, site.webmanifest
scripts/check-dist.mjs     npm `check:dist`: post-build CSP, brand, Serbian-is-Latin,
                           /admin first-party + media checks
scripts/mirror-media.mjs   npm `prebuild`: mirrors src/images -> public/images so /admin
                           can show the originals (gitignored; no page links there)
scripts/translate.mjs      npm `translate`: offline DeepL fill of i18n dictionaries (not in build)
scripts/translate-content.mjs  npm `translate:content`: the CLI equivalent of what /admin
                           does on save — for bulk work, not the board's path
scripts/lib/require-api-key.mjs  the one Node-only bit: DEEPL_API_KEY from the environment
src/lib/translate/         ISOMORPHIC — imported by BOTH the CLIs and the Worker, so no
                           node: imports, no fs, no process (see CLAUDE.md)
  glossary.js                THE translation policy: protected names, one pinned term per
                             concept per language, variant/morphology rules, address form
  deepl.js                   one request per string + `context`; free/pro endpoint split
  validate.js                the gate — nothing is written until it passes
  content.js                 ONE answer to "does this need translating?": TRANSLATABLE,
                             sourceHash (Web Crypto), translationState, planFor,
                             mergeTranslations, gate
  flat.js                    flat <-> nested dictionary conversion, in one place
  {validate,deepl,content}.test.js  `npm test`; cases are strings that actually shipped,
                             plus a golden test that every committed sourceHash still matches
.github/workflows/         ci.yml — test+build+check+check:dist, on PRs to main AND
                           pushes to main. translate-content.yml is GONE — /admin
                           translates on save; see #59/#61 in §2
astro.config.mjs           site, trailingSlash, build.format:'file', sitemap integration,
                           and the two settings that keep the CSP inline-free
                           (inlineStylesheets:'never', vite assetsInlineLimit:0)
wrangler.jsonc             Cloudflare: assets.directory = ./dist, not_found_handling
```

**Load-bearing rules** (full list in `CLAUDE.md`): pages import content only via
`lib/content.js`; JSON image paths are relative to `src/`; internal links are
extensionless; events are never marked "past" by hand; shared chrome lives once in
`BaseLayout.astro`; don't set `inlineStylesheets` to inline.

---

## 2. Done ✅ (all merged to `main`)

| PR | What shipped |
|----|--------------|
| #12 | Fixed stale post-Astro cache headers; **generated sitemap** (`@astrojs/sitemap`, `sitemap-index.xml`); `/_astro/*` cached immutable |
| #13 | **Zod content schemas** (`lib/schema.js` + `lib/content.js`) — bad content fails the build with a clear message |
| #14 | **Sveltia CMS at `/admin`** + content restructured to one-file-per-entry; members gained `order`; scoped `/admin` CSP; self-hosted bundle |
| #15 | CMS **logo branding** (theme-adaptive `yunited-logo-cms.svg`) |
| #16 | Fixed CMS toolbar icons rendering as text (allow Google Fonts in `/admin` CSP) — *regressed in #40 when Sveltia moved font hosts; refixed and made self-checking in #42* |
| #17 | Image loader accepts **any raster format, any case**; HEIC gives a clear board-facing error |
| #18 | This tracker (`PLAN.md`) + `CLAUDE.md` pointer to it |
| #19 | **CI on every PR** — `npm ci` + `build` + `check` (Node 22); catches bad content before merge |
| #30 | Table-of-contents rail: legible over dark sections, bound to the content rather than the viewport |
| #33 | Board members no longer machine-translated (`memberSchema` forbids `i18n`); **404 actually served** (`not_found_handling`) with no dead `/de/404` hreflang; visible focus ring, real form-error announcement, no sideways scroll on narrow phones |
| #34 | **CSP hardening** — `'unsafe-inline'` dropped from `script-src` and `style-src` |
| #35 | German copy fixes ("an der HSG"); karaoke rather than casino in the shared copy |
| #36 | **`/partners` pitch page**, localized like every other route, linked from nav + footer |
| #37 | **Serbian written in Latin**, enforced in the DeepL pipeline itself (`toSerbianLatin`); **`bs`/`hr`/`sr` published** (`complete: true`) — sitemap 14 → 40 locs; brand capitalization audited across all four dictionaries |
| #38 | **Guardrails**: `npm test` (14 cases over `splitEvents`/`formatEventDate`), `npm run check:dist` (asserts the CSP invariants on built output), a build-time warning when the calendar is empty, and `astro check` down to **0/0/0** |
| #39 | **`content/partners/` collection** — schema, CMS collection, and a logo strip that renders only once there is a partner |
| #40 | **Astro 5 → 7, Zod 3 → 4, TypeScript 5 → 6** — fixes 4 CVEs (high-severity libvips in `sharp <0.35.0`); AVIF uploads now work |
| #41 | PLAN.md sync — logged #34–#40; the agent may not weaken the guardrails to go green |
| #42 | **CMS toolbar icons fixed again** — `@sveltia/cms` 0.174 moved its fonts from Google Fonts to Fontsource on `cdn.jsdelivr.net`; `check:dist` now reads the font URLs out of the vendored bundle so this can't regress silently a third time |
| #43 | **CMS image previews fixed** — Sveltia fetches a photo by its public URL, but source images live in `src/` for the sharp pipeline and were never served; `mirror-media.mjs` publishes them at `/images/…` (noindex, no page links there) and `check:dist` asserts every content image resolves |
| #44 | **Sveltia CMS removed; `/admin` rebuilt first-party** — a plain HTML/CSS/JS form plus a Cloudflare Worker (`worker/`) that commits through the GitHub Git Data API in **one atomic commit** per save. Access is now a Cloudflare Zero Trust email allow-list instead of a GitHub account + OAuth app + a second worker; one encrypted `GITHUB_TOKEN` replaced per-person tokens. The form is **generated from the same registry the Worker validates with** (`worker/collections.js` → `src/lib/schema.js`), so the config.yml↔schema drift class is gone — along with the `/admin` CSP's `unsafe-inline`, `wasm-unsafe-eval`, GitHub-API and font-CDN allowances. Also **repaired four events** whose `image` Sveltia had saved as `/images/…`, which had been failing the build (and so the deploy) unnoticed |
| #45 | **Fixed scroll-driven effects that had never run** — the minifier folds `animation:` + a separate `animation-timeline` into one shorthand carrying the timeline, which browsers supporting only the longhand must discard *entirely*. Since the `@supports` guard tests the longhand, the motif divider and the magazine-grid card assembly passed the guard and then had no animation and no fallback. Both rewritten as longhands; `check:dist` now fails on a folded shorthand. Event cards reveal on scroll again, too: they had carried a hard-coded `is-visible` since the Astro migration, which pre-revealed every one so the entrance never played |
| #46 | **Fixed links run into the preceding word** — the footer read "managed on**uniclubs.ch**" in all five locales (a newline in the template collapsing to nothing), and German's exchange line read "den Kontakt her.**Kontakt aufnehmen**" (DeepL had restructured the `…Pre` fragment into a complete sentence). `check:dist` now fails on a link glued to the character before it |
| #47–#48 | **The folk-motif divider slides as it crosses the viewport** — transform-driven and tied to scroll position, clipped with `overflow: clip` so the strip actually travels. The tricolour band that briefly sat under the header is gone: three solid vertical bands of red/azure/gold read as the Romanian flag, the wrong association for this club |
| #49 | **Admin lists are sortable**, and the motif's travel softened to a third of its original distance |
| — | **Translation pipeline rebuilt; Bosnian split from Croatian** — the board judged the bs/hr/sr copy inadequate, and an audit of all 178 dictionary keys plus all 9 event files found the defects were systematic. Verified samples: the buddy system was described as a **`sustav prijateljskog parenja`** — a *mating* system — on the About page; "Outgoing HSG students" read `Budući studenti` (prospective) in bcs and `Brucoši` (freshmen) in sr, directly above the line "YUnited runs no formal programme for students abroad"; both locales shipped `semestar uSt. Gallenu` with the preposition fused to the city; `contact.formSending`, a submit button's in-flight label, read `Pošalji…` — the imperative "Send"; and Déja Vu Bar became `bar Deža Vju` on a card whose `location` field still said `Déja Vu Bar`. **The cause was architectural, not a bad vendor:** DeepL received each string alone, with no context and no glossary, so a fragment could not agree with the preposition before it and "Sending…" was indistinguishable from a command. Now one request per language carries the whole dictionary, against a pinned glossary (`scripts/lib/glossary.mjs`), and **nothing is written until `scripts/lib/validate.mjs` passes** — key sets, placeholders, tag structure and hrefs, protected names, forbidden renderings, script, regional variant, glued tokens, split-sentence joins; unit-tested and mutation-checked in `npm test`. Also: `bcs.json` served **both** bs and hr while being overwhelmingly Croatian with stray Bosnian forms (the same university appeared under two names in one file), so it is now a real `hr.json` + `bs.json`; the address form is unified on informal `ti`, matching the German that was already informal; and `check:dist` asserts no Cyrillic on Serbian pages. `deepl.mjs` deleted. **All 178 UI keys x 3 languages and all 9 events were re-translated**, and all of it passes the gate at 0 errors / 0 warnings; 60 of the 178 keys now genuinely differ between `bs` and `hr`, so the split earns its keep rather than shipping two files that pretend to differ |
| — | **The board manages its own `/admin` allow-list** — a fourth tab reads and rewrites the Cloudflare Access rule group that decides who can open the panel, so adding a board member no longer needs the Zero Trust dashboard and therefore no longer needs the one person who has it. `worker/board-access.js` is the client; **it authenticates nobody** — Access still does that, and an added address still has to pass Access's own login. Two lockout rails are enforced server-side (`guardChange`): you cannot remove yourself, and you cannot empty the list. The Cloudflare API has no PATCH, no ETag and a `PUT` that replaces the whole group, so every write round-trips `name`/`exclude`/`require` and any non-email include rule (a unit test guards exactly that), and the panel sends the list it was showing so a concurrent edit is refused with a 409 instead of silently overwritten. The Worker logs the actor's verified email on every change — Cloudflare's own logs only ever name the shared API token. **Inert until the human steps in §3 are done** |
| — | **TOC rail moved to the right gutter, sized from the gutter, and made compositing-independent** — the rail had been placed with `left: max(--space-4, (100vw - --max-width)/2 - 140px)`, which clamps to 24px the moment the gutter runs out; that is exactly where the `.container` text edge sits, so **between the 1100px breakpoint and ~1480px the 150px rail was drawn on top of the leftmost content** at `z-index: 20`. Position and width are now both derived from `--toc-gutter`, the whitespace beside the content column, so the rail's inner edge sits a constant `--toc-gap` from the text at every width and its outer edge never reaches the screen edge; it shrinks from 150px to a 6.5rem floor (sized off the longest label) instead of holding one width, and the breakpoint moves to **1400px**, below which the gutter genuinely cannot hold a labelled rail. The gutter is a percentage of `<main>` rather than `100vw`, which excludes a classic scrollbar — the old formula was ~7.5px off on Windows/Linux. Separately, `.page-toc ol` was `position: sticky` with `transform: translateY(-50%)`, so the box sticking was resolved against and the box painted disagreed by half a rail; **sticky resolves on the compositor thread when the layer is accelerated and on the main thread when it is not, so the rail's detach at the bottom of `<main>` differed with hardware acceleration on vs. off**. The transform is gone — the sticky box is now exactly `100vh` with the list flex-centred in it, landing on the same optical centre (`50vh + 3rem`) with the sticky box and the painted box identical. Do not reintroduce `will-change`/`translate3d`/`backface-visibility` here; each force-promotes a layer and brings the divergence back. Also: the full-height column no longer eats clicks (`pointer-events`), and the rail line is mirrored to the outer edge with labels right-aligned |
| — | **The TOC rail was rendered in a browser for the first time, and then put back the way it was** *(follow-up to the row above, which shipped unrendered)*. #55's claims were code comments no command in this repo can check, and one was false: the comments sized the rail around a longest label of `"Buddy-System"` (12ch) when the real longest is `toc.buddy` in hr/bs/sr, **`"Sustav/Sistem prijatelja"` at 17ch**, on the very page that lists it. Measured in Chrome: Space Mono advances **612/1000 em**, so at `0.66rem` with `0.04em` tracking a character is 6.885px and that label is **117.0px**. But the more important finding was behavioural, and it is why the gutter-derived rail was reverted: #55 replaced the short sticky box (`top: calc(50vh + 3rem)` + `translateY(-50%)`, the box being the height of the rail) with a **full `100vh` box centred by flexbox**. Those look identical while the rail is held, and they land on the same optical centre — but a 100vh box **stops sticking a whole viewport earlier**, so for the last stretch of the page the rail rode up and hung clipped under the header showing three of its four entries. So the rail is now **the pre-#55 rail, mirrored to the right**: fixed 150px, the same `max(--space-4, (100vw - --max-width)/2 - 140px)` offset, the same short sticky box, rule on the outer edge with labels right-aligned. Confirmed in Chrome at the bottom of `/hr/about`: rail box back to 119px, held at a constant `top: 439`, easing up 160px at the end with **all four entries visible and clear of the footer**. The one number that had to change is the **breakpoint, 1100px → 1480px**: `max(--space-4, …)` clamps to 24px once the margin runs out, which is exactly where the `.container` text edge sits, so below 1480px the old rail was drawn over the content — on the left before, and it would do the same on the right. Above 1480px this is pixel-identical to the rail that was there; below it, the old one was broken. `--toc-width-max`/`--toc-gap` are gone with the formula that used them. **New rule in `CLAUDE.md`:** layout changes need a browser pass at the widths their breakpoints name, in a long-label locale, and a claim in a code comment is not verification |
| — | **TOC: the highlight follows the reading position, and the rail is the same length on every page** — two faults, both seen in Chrome on `/hr/about` at 2548×1175. (1) The scroll spy was an `IntersectionObserver` on a 10%-tall band pinned 20% down the viewport, and the band **could not be reached at all by a section too close to the end of the document**: the last entry is only reachable while `document height − last section top > (1 − line) × viewport`, so *Vrijednosti* went unlit at every viewport taller than ~1154px and *Priča* stayed highlighted over a screen full of Values — the same on `/`, where *Tko smo mi* needed 2364px of scroll on a page with 2294px of it. It also fired late: 20% down is high enough that the full-width dark `#story` band had filled most of the screen before its entry lit. Now one rAF-throttled scroll pass (merged with the backdrop sync that already ran there, since both need the same rects) picks the last section whose top has crossed a reading line at **0.4 × viewport**, with `atBottom` closing the reachability case outright. Measured: the buddy→story switch lands on the predicted pixel (`buddy` at 1250, `story` at 1262, predicted 1256), and the bottom of both pages now highlights its own last entry. (2) The rail was as tall as its entries, and the two pages don't have the same number of them — four on `/about`, three on `/` — so the centred rails sat 15px out from each other at both ends. `min-height: 120px` on the `<ol>` with the entries sharing it: both pages measure **top 576 / bottom 696** held, **551 / 671** at the foot, and the rail still clears the footer (671 ≤ 747). `min-height`, not `height`, so a label that ever wraps grows the rail instead of overflowing it; nothing wraps today |
| #54 | **`schema.org/Event` JSON-LD for dated upcoming events** — `events.astro` emits one `Event` block per dated upcoming event (`name`, `startDate`, `description`, `url`, and `location` when set), localized exactly the way its `EventCard` renders, following `index.astro`'s existing `Organization` block. The shaping is a pure function, `eventJsonLd()` in `src/lib/events.js`, with 5 `npm test` cases (null for TBA, date+time vs date-only `startDate`, location omitted when unset, a malformed time treated as no time). No new content field, no new dependency. Data-block `<script type="application/ld+json">`, exempt from `script-src` per the CSP convention. **Nothing renders on `main` today** — the live calendar has no dated upcoming event, which is the correct TBA-skip behaviour, so it was verified against the built HTML with a temporary dated fixture |
| #59, #61 | **Translation migrated off Anthropic and moved into the Worker** — the succession fix, in two parts. #59 swapped the engine to **DeepL's free tier**: one request per string with the `context` parameter carrying whatever disambiguates it (a hand-written `NOTES` entry, or a split `Pre`/`Link`/`Post` sentence joined back together), because `context` is per-request and cannot be indexed per text. #61 then moved the whole mechanism out of GitHub Actions and into `/admin`, because the engine was only half the problem: the machinery still lived behind a repo secret in a workflow whose failures surfaced only in GitHub's Actions tab, a page no board member has an account for — which is why it failed unnoticed from 2026-07-30. **Now:** an event is translated **inside the same commit as the board's save** (one rebuild, not two); each event's row badges its state; every event has a **Translations** page whose four languages are editable, and a hand correction survives until the English text changes; there is a **Translate now** button; a **Translations tab** reports key health and live usage and lets any board member paste a replacement key; and a **nightly cron sweep** (`17 4 * * *`) fills whatever a save missed, fixing up to five entries in one `[auto-translate]` commit. `.github/workflows/translate-content.yml` is **deleted**; the CLIs stay for a maintainer's bulk work. **The rules live in one place** — `src/lib/translate/content.js`, imported by both the Worker and the CLIs, because two copies of "does this need translating?" do not fail loudly, they re-translate over the board's corrections. That directory is **isomorphic** (Node *and* workerd), which is a hard constraint: no `node:`, no `fs`, no `process`. A latent bug went with it — an entry authored in anything but English could never be up to date, harmless at a yearly CLI run and a nightly rewrite of hand corrections once a cron exists |
| #60 | **Design pass: paper studio** — the editorial/broadsheet direction kept, the volume turned down. The 2px ink border became two hairline weights; the hard offset shadow, previously on every button, card hover, language menu and form focus, now belongs to `.btn-gold` alone (ink-on-paper and paper-on-ink variants, because an ink shadow on an ink ground is invisible); gold became the only interactive colour with red and azure demoted to punctuation; `h3` went 1.2rem/600 → 1.5rem/700 to fill the hole in the type scale where card titles sit; section padding became three values chosen by structure rather than one; and a photo-less card became paper-soft with the kilim strip instead of a saturated block. Four of six animations were retired, which also deleted the `IntersectionObserver` from `BaseLayout.astro`, the `scripting: enabled` gate and the `.reveal` class from eighteen elements. Chosen from rendered samples rather than described |
| #62 | **One orchestrated load, and cards that land** — #60 cut the site to two moments and left everything below the hero inert; this is the third, chosen from three live specimens scrolling in lockstep (Composed, with Full press's card entrance). The load is now a **sequence rather than a metronome**: the header rule draws across, the hero headline is uncovered by a curtain retracting downward, the standfirst and buttons follow, the motif strip draws in last — same total duration as the four-element 14px rise it replaces, but the beats differ from each other. On scroll, section heads rise and cards land with 1.5° of rotation coming out while their photographs settle out of a 1.07 over-scale across roughly twice the card's range, so the photo is still resolving after the card has come to rest. **This is not the `.reveal` that was deleted:** `animation-timeline: view()`, the same mechanism as the motif drift — no JavaScript, no observer, no gate, no class on any component — and the `@supports` guard doubles as the fallback, so content can never be stranded at `opacity: 0`. Four things are load-bearing and easy to undo by accident: ranges are `cover` not `entry`; the animations touch the individual `translate`/`rotate`/`scale` properties, never `transform` (an animation holds its final value above any normal declaration, so `to { transform: none }` would have silently killed `.card:hover`'s lift site-wide); `.card`/`.card-image` are `overflow: clip`, not `hidden` (`hidden` makes a box a scroll container, which re-parents the photo's `view()` timeline and freezes it at one frame — the same failure the motif divider had); and longhands only, since `check:dist` fails on a folded `animation:` shorthand (#45). The **1.5° rotation is the number to watch** — a larger one is what made this grid read as unfinished before. Now summarized as a convention in `CLAUDE.md` |
| #63 | **Semester membership fee lowered to CHF 15** — updated in all five dictionaries (`join.semesterTitle`, the card heading, and `meta.join.description`, the page title/social preview, which was the other place the amount was written out) |
| #64 | **Fixed the mobile events grid, closed its row-gaps, gave it a real empty state** — three faults on `/events`, found while polishing a fourth. **The bug:** the 900px media query meant to collapse the magazine grid's horizontal lead/4-wide cards back to a stacked phone layout had never actually applied, since the grid shipped — the desktop rule is keyed off `:nth-child(...)`, three classes of specificity (four with `.card-image`), and the collapse's bare `.magazine-grid > .card` (two classes) lost outright; only `grid-column`, carrying `!important`, took effect, leaving a 137px sliver of photo beside a full-height text column on every phone. Fixed by naming the exact selectors being undone so specificity ties instead of losing. **The gaps:** the 6/4+2/3+3 row cycle only closes its own row at 1, 3, 5 and 6 events; at 2 or 4 (and every +5 after) the last card sat alone beside unused columns — a `:last-child` rule now lets it run the full row. **The headings:** `text-wrap: balance` on `h1`/`h2`/`h3`. **The empty state:** the grey "no upcoming events" note read like an error; replaced with `EmptyUpcoming.astro`, a lead-slot card shared by the homepage teaser and the events page, carrying the kilim strip and turning both mentions into real links. Its four new i18n keys (`emptyUpcomingEyebrow`/`Heading`/`Body`/`Instagram`/`Uniclubs`) have no hr/bs/sr/de translation yet and fall back to English — `npm run translate` fills them in |
| #66–#72 | **A batch of small roadmap/content items** — the add-to-calendar `.ics` link, a skip-to-main-content link (WCAG 2.4.1), a Formspree `preconnect`, an `/events.xml` RSS feed, an `npm audit` fix (7 → 0 vulnerabilities) plus a non-blocking audit step and `workflow_dispatch` in CI, and two rounds of join-page copy ("casino nights" → "adventures"/"avanture"/"Abenteuer", English then the other four locales). Each is detailed under its own §3/§4/§5 item above rather than repeated here |
| #73 | **Membership: CHF 15/semester → CHF 30/year, everywhere; "buddy system" → "kumstvo" in hr/bs/sr** — two board-requested content changes. **Pricing:** `meta.join.description`, `join.semesterTitle` and `join.semesterBody` updated in all five dictionaries ("Semester membership — CHF 15" → "Annual membership — CHF 30"; "for the semester" → "for the year"/"pro Jahr"/"godišnje", matching each language's existing construction). **Terminology:** the club judged a literal "sustav/sistem prijatelja" ("system of friends") undersells the programme, and picked **kumstvo** — the traditional Balkan god-parent/sponsor kinship — instead. Replaced in every hr/bs/sr string that names the concept (`toc.buddy`, `about.buddyEyebrow`/`buddyLede`/`buddyCta`, `about.missionP4`, `exchange.incomingBuddy`, `contact.topicExchange`), with the surrounding grammar re-agreed where "sustav/sistem" was masculine and "kumstvo" is neuter (`naš` → `naše`). **German is untouched** — the request was Balkan-languages-only, and German's own "Buddy-System" loanword was never the problem. `src/lib/translate/glossary.js`'s `TERMS.buddySystem` — the pinned-terminology policy both the Worker and the CLIs read — is updated to match: `canonical` is now `kumstvo` for hr/bs/sr, and the old `sustav prijatelj`/`sistem prijatelj` renderings are added to `forbidden`, so a future auto-translation of new buddy-system copy can't quietly regress to the literal phrase this replaces. One existing `validate.test.js` fixture asserted the *old* canonical as the "good, zero-error" case; updated to assert `kumstvo` instead, plus a new assertion that the old canonical is now itself flagged. The Casino Night event and its imagery are untouched, per instruction. **Verified:** `npm test` 146/146 · `build` (41 pages) · `check` 0/0/0 · `check:dist` · `checkDictionary()` run directly against the real hr/bs/sr dictionaries (not just test fixtures) confirms zero buddy-system-related findings, and the 7 pre-existing findings per locale (untranslated `skipLink`/`emptyUpcoming*`/`addToCalendar` keys) are unchanged · confirmed in the built HTML for every locale. **Not done, flagged for a decision:** `events.heroLede` in en/hr/bs/sr still names "casino nights"/"casino večeri" — a different page (`/events`, not `/join`) that was out of scope for the earlier "adventures" wording change and untouched here too |

| — | **Buddy system, part 1 — the `/buddy` page** *(branch `buddy-system`)* — the programme gets its own localized page (nav "Buddy" en/de, "Kumstvo" hr/bs/sr): a two-column explanation, a sign-up prompt, then the sign-up form at the foot; About keeps a teaser linking across. `buddy/confirmed`, `buddy/removed`, `buddy/check-email` and a `buddy/pair` dashboard shell. The pairing rule is a pure seeded function `planMatches()` in `src/lib/buddy/match.js` (fill everyone to one buddy, then overflow **only** onto buddies who opted in, then hold the rest) with `schema.js` (Zod signup) and `tokens.js` alongside it. Full `buddy.*` block in all five dictionaries — hr/bs/sr on *kumstvo*, bs/sr in their own lexis, sr in Latin. `npm test` 171 |
| — | **Buddy system, part 2 — signup, matching, emails, admin** *(branch `buddy-system`)* — the server half. New **Cloudflare D1** store (`worker/migrations/0001_buddy.sql`: `signups`/`rounds`/`pairs`) reached only through `/buddy/api/*` (public, token-authed — no Access) and `/admin/api/buddy/*` (behind the existing Access gate). `worker/buddy.js` + `worker/buddy-store.js` handle signup → email verification → the board's **preview → commit → send** round from a new `/admin` **Buddy** tab → the per-pair page with "we've connected" / "something's not working". Email is **Resend** (free tier) via `src/lib/buddy/emails.js` — `sendEmail` never throws, a failure never blocks a signup or a round, and with no key the board confirms people by hand from the tab. Nightly cron also purges unverified signups older than 14 days. `npm test` 198 · `build` 66 pages · `check` 0/0/0 · `check:dist`. **Inert until the two §3 items (create the D1 database; set `RESEND_API_KEY` + DNS) are done.** |

Earlier foundation (pre-#12): Astro migration + build-time image optimization.

---

## 3. Pending — human actions ⏳

Manual/account steps (code is in place).

- [x] ~~**`ANTHROPIC_API_KEY` must be added to the repository's Actions
      secrets**~~ — **not doing this. Board decision, 2026-08-06.** Anthropic's
      API is metered and billed to a personal account, and the club cannot
      inherit that: at the end of a presidency the key either follows the person
      out of the door (and translation stops) or has to be re-issued and re-paid
      by the next board. A website whose translations depend on someone's
      personal card is not a website the club owns. Superseded by the DeepL item
      in §4 — **see "Translation runs on DeepL's free tier, not a paid Anthropic
      key"**, which is the actual procedure.

      **Resolved — the whole degraded state described here is gone (2026-08-23).**
      It read: the "Translate content" workflow fails on every push to
      `content/**` (last failure 2026-07-30, run `30544840928`), so a `/admin`
      save publishes in its authored language with the other four locales
      unfilled. That workflow **no longer exists** — `/admin` translates each
      event inside the same commit as the save, on DeepL, with a nightly cron
      sweep behind it, and `DEEPL_API_KEY` is set as a Worker secret. See #59/#61
      in §2 and the ticked out-of-band item below.

      `DEEPL_API_KEY` **stays** (Worker secret + local `.env` for the CLIs). The
      earlier instruction to delete it is withdrawn.

      *Unchanged either way: the site build never calls a translation API and
      stays hermetic; no translation secret belongs in the Cloudflare build
      settings, so a deploy can never depend on a translation API being
      reachable.*
- [x] ~~Deploy `sveltia-cms-auth` worker + GitHub OAuth app + secrets~~ — obsolete;
      Sveltia and its auth worker were removed. Access + one Worker secret replaced them.
- [x] **Google Search Console**: sitemap switched to `https://yunited.ch/sitemap-index.xml`.

- [x] **Both out-of-band translation steps are done — verified 2026-08-23.**
      Translation works in production, and the board can replace the key without
      a maintainer.
      1. **`DEEPL_API_KEY` is set.** `npx wrangler secret list` returns
         `CF_API_TOKEN`, `DEEPL_API_KEY` and `GITHUB_TOKEN` — all three secrets
         this project has.
      2. **The settings store exists and is bound.** `wrangler kv namespace list`
         shows `ADMIN_SETTINGS` (`ad0d3dcdf58b44928b30362db57101a3`), and
         `wrangler.jsonc` binds it as `ADMIN_SETTINGS` with `remote: true` — the
         binding name the Worker actually reads (fixed in `0fc6e43`; the earlier
         text on this line said `SETTINGS`, which would have silently done
         nothing). So the Translations tab offers a box to paste into, which is
         the actual succession fix.

      **The store is currently empty** (`wrangler kv key list` → `[]`), which is
      the expected default: with no board-set key the `DEEPL_API_KEY` secret
      answers, and the first paste into the Translations tab creates
      `deepl.apiKey`. The deployed Worker is current — newest deployment
      2026-08-21 21:50 UTC, minutes after #62 merged.

      **Still worth doing, and it is now the only open thread here:** issue the
      DeepL key from **yunited@shsg.ch** rather than a personal address, so a
      handover is a password change. Same for `GITHUB_TOKEN` and `CF_API_TOKEN`.
      See [`docs/HANDOVER.md`](docs/HANDOVER.md).

- [ ] **Turn on the buddy system** — 🧑 maintainer, two out-of-band steps; the
      code is on branch `buddy-system` and does nothing until both are done.
      Full recipe in [`worker/README.md`](worker/README.md) → "The buddy system".
      1. **Create the D1 database and apply the schema.**
         ```bash
         npx wrangler d1 create yunited-buddy
         # paste the printed id into wrangler.jsonc (replace REPLACE_WITH_D1_ID)
         npx wrangler d1 migrations apply yunited-buddy --remote
         ```
         With no `BUDDY_DB` binding the `/admin` **Buddy** tab is hidden and
         `/buddy/api/*` returns a 503 naming this step.
      2. **Set the Resend key** and add its SPF/DKIM records for `yunited.ch`.
         ```bash
         npx wrangler secret put RESEND_API_KEY
         ```
         Free tier (100/day, 3,000/month) covers the club. Ideally the Resend
         account is on `yunited@shsg.ch`, not a personal address — same reasoning
         as the DeepL key. **Signups still work with no key** (the board confirms
         people by hand from the Buddy tab); no round email goes out until it is
         set.

      Also open, once it is live: decide the round cadence (assume term-start +
      one straggler round), and whether the optional UniClubs member-list
      cross-check is worth doing (export a CSV from UniClubs each term).

- [ ] **Add the 26/27 events when the dates are set** — 🧑 board. **Still open,
      re-verified 2026-08-23:** all 8 dated events are in the past (the newest is
      2026-05-13) and "Upcoming" shows only the TBA *Meet & Greet* card, so the site reads as dormant going
      into the new academic year. Nothing is broken — this is just an empty
      calendar, and the board adds events in `/admin` when the term is planned. The
      build now **warns** whenever no upcoming event has a date, so this state
      cannot go unnoticed for eleven weeks again as it did between May and July.

- [ ] **A standing "grab a coffee & talk" meetup** — 🧑 board, venue and cadence
      still to decide. A recurring, low-effort get-together (no programme, no
      RSVP pressure) that gives members a reason to show up between the big
      termly events, and gives the board something to point new students at in
      week one.
      **It also solves the problem above cheaply:** it can go up *now*, before
      the 26/27 dates are fixed, as a TBA-dated event — which floats to the top
      of Upcoming — so the events page stops reading as dormant while the term
      is still being planned. Add it in `/admin` with the date left empty, then
      fill the date in once the cadence is settled.
      Open questions for the board: which café (somewhere near the HSG campus
      that takes a group without a booking), and how often — weekly is a
      commitment the board has to keep, fortnightly or monthly is easier to
      sustain and easier to promote.

      **Reaffirmed 2026-08-07: this stays a board action until further notice.**
      Not deferred and not dropped — it needs a venue and a cadence, and neither
      is a decision code can make. Recording it so a later review does not read
      the standing checkbox as neglect and try to "unblock" it. Nothing in the
      repo is waiting on it; the empty-calendar warning is expected to keep
      firing until it (or a real 26/27 date) lands.

- [x] **`GITHUB_TOKEN` replaced with a non-expiring PAT — done 2026-08-06.**
      This used to be the deadline item on this page: the old token expired end
      of August 2026, and when it lapsed the board would have lost the only way
      to publish (every save fails, `/admin` says so explicitly with a 502 naming
      the missing permission, and GitHub emails the token owner in advance, but
      nothing else warns anyone). It is now a **non-expiring** fine-grained PAT,
      so this is a one-off rather than a recurring deadline. Set with:

      ```bash
      npx wrangler secret put GITHUB_TOKEN
      ```

      **Still worth doing once:** a save from `/admin` confirms it end to end —
      the commit shows up in this repo's history within seconds. Full steps, and
      what each failure message means, in
      [`worker/README.md`](worker/README.md).

- [x] **The `/admin` Access tab is verified in production — done 2026-08-06.**
      The list loads and matches the `yunited-board` group, an address was added
      and removed, sign-in was confirmed to work and then to stop, and
      `wrangler tail` named the acting board member on the change.

      **One gotcha worth recording, because it cost an hour and looked like
      something else.** The tab loaded but every read failed with *"the Cloudflare
      token was rejected… probably expired, or missing 'Access: Organizations,
      Identity Providers, and Groups: Edit'"*. The token was neither expired nor
      under-permissioned: **the secret had been pasted twice**, so the stored
      value was the token doubled. Cloudflare rejects that with the same `401` as
      a dead token, and `worker/index.js` phrases 401 and 403 identically — so the
      message pointed at the two causes it could not distinguish from a
      malformed one. Diagnosis that actually works, in order: the tab *appearing*
      already proves the secret is set (`accessConfigured`), a wrong group ID
      would be a 404 rather than this message, and `wrangler whoami` confirms
      `CF_ACCOUNT_ID`. That leaves the token value itself, which is testable
      **before** installing it — `GET /client/v4/user/tokens/verify` says whether
      the token lives, and a `GET` on the group URL says whether it has the
      permission. Note also that **editing a token's permissions keeps the same
      value**, so a permission fix needs no `wrangler secret put` and no deploy.

      **The check that was run**, kept because it is the one to repeat if the
      group, the token or the policy is ever changed: (1) the **Access** tab is
      next to Partners; (2) **the list matches the Zero Trust group exactly** — a
      wrong-but-valid group UUID shows somebody else's group, or an empty list,
      with no error, and this is the only check that catches it; (3) add a
      throwaway address, confirm it in Zero Trust, sign in as it in a private
      window, then remove it and confirm sign-in now fails; (4) `npx wrangler
      tail` during one change, where the log line must name *your* email —
      Cloudflare's own logs only ever name the shared token, so that line is the
      whole per-person audit trail.

      **Worth knowing about the token:** Cloudflare has no groups-only permission,
      so it can also write the account's identity providers and Zero Trust
      settings — wider than `GITHUB_TOKEN`. Accepted deliberately; the fallback is
      to delete the secret, which returns `/admin` to exactly what it was.

      *Unrelated but observed while testing: an address on Gmail never received
      Access's one-time PIN. It comes from `noreply@notify.cloudflare.com` and
      Gmail files it as spam often enough to be worth telling a new board member
      before their first sign-in. Nothing to fix in this repo.*

_On demand (not a pending task): board members add and remove each other in the
`Access` tab at `/admin`; a change takes effect in seconds. The break-glass path,
if nobody can get in at all, is Cloudflare Zero Trust → Access → Groups →
`yunited-board` — steps in [`docs/ADMIN.md`](docs/ADMIN.md)._

---

## 4. Planned ahead 🗺️ (roadmap, in suggested order)

Status: `[ ]` not started · `[~]` in progress · `[x]` done.
Items tagged **🧑 human-led** must NOT be auto-implemented by the weekly agent (§7) —
they carry design decisions that need a person. The agent skips them.

- [x] **Design pass: paper studio** — the site kept its editorial/broadsheet
      direction and got the volume turned down. Seven moves, all in
      `src/styles/global.css` unless noted: the 2px ink border became two
      hairline weights (`--rule` 14%, `--rule-strong` 24%); the hard offset
      shadow, previously on every button, card hover, language menu and form
      focus, now belongs to `.btn-gold` alone (`--shadow-hard-ink` on paper,
      `--shadow-hard-paper` on ink surfaces, because an ink shadow on an ink
      ground is invisible); gold became the only interactive colour, with red
      and azure demoted to punctuation (the kilim motif, a 2px tick on
      `.card-date`, a panel's top rule); `h3` went 1.2rem/600 → 1.5rem/700 to
      fill the hole in the type scale where card titles sit; section padding
      became three values chosen by structure rather than one; four of the six
      animations were retired (`.reveal`, its per-child stagger, the
      `.eyebrow::after` rule-draw and `puzzle-in`), leaving the hero entrance
      and the motif drift; and a photo-less card became paper-soft with the
      kilim strip instead of a saturated block. Removing `.reveal` also deleted
      the IntersectionObserver from `BaseLayout.astro`, the `scripting: enabled`
      gate, and the class from eighteen elements across the pages and
      `EventCard.astro`. Chosen from rendered samples rather than described.

- [x] **Entrance motion, restored scroll-driven** — the paper-studio pass above cut
      to two moments and left the page inert everywhere below the hero. Chosen
      from three live specimens (Quiet / Composed / Full press) scrolling in
      lockstep; the board picked **Composed with Full press's card entrance**.
      All of it is in `src/styles/global.css`.

      **The load is one orchestrated sequence**, in the order a page is made:
      the header rule draws itself across (0.55s), the hero headline is
      uncovered by a curtain retracting downward (0.16s), the standfirst and
      buttons follow (0.42s / 0.52s), the motif strip draws in last (0.6s).
      That replaced four elements doing the same 14px rise on an 80ms
      metronome — same duration and restraint, but the beats now differ from
      each other, which is the whole difference between a page that fades in
      and one that looks composed. **On scroll**, section heads rise and cards
      land with `card-in` (26px, 1.5° of rotation coming out, `--ease-snap`)
      while their photographs settle out of a 1.07 over-scale across roughly
      twice the card's range, so the photo is still resolving after the card
      has come to rest.

      **This is not the `.reveal` that was deleted, and must not become it
      again:** `animation-timeline: view()`, the same mechanism as the motif
      drift — no JavaScript, no IntersectionObserver, no `scripting: enabled`
      gate, no class on any component. The `@supports` guard doubles as the
      fallback: a browser without scroll timelines (Firefox today) never parses
      the rules, so content is simply present and can never be stranded at
      `opacity: 0`.

      Four things here are load-bearing and easy to undo by accident:
      **(1)** ranges are `cover`, not `entry` — an `entry` range is as long as
      the element is tall, so a one-line eyebrow would finish in ~20px of scroll
      while a lead card took 400px. **(2)** `card-in` and `photo-settle` animate
      the *individual* `translate`/`rotate`/`scale` properties, not `transform`;
      an animation holds its final value above any normal declaration, so a
      `to { transform: none }` would have silently outranked
      `.card:hover { transform: translateY(-3px) }` and killed the hover lift
      site-wide. **(3)** `.card` and `.card-image` are `overflow: clip`, not
      `hidden` — `hidden` makes a box a scroll container, which re-parented the
      photo's `view()` timeline to its own frame and left `photo-settle` frozen
      at one frame (measured: a degenerate cover range of -264 → 264). **(4)**
      longhands only; `check:dist` fails on a folded `animation:` shorthand (#45).
      The **1.5° card rotation** is the one number to watch — a bigger version
      of it is what made the grid read as unfinished before.

- [x] **CI check on PRs** — shipped in #19 (`.github/workflows/ci.yml`).
- [x] **CSP hardening** — **`'unsafe-inline'` is now gone from both `script-src` and
      `style-src`** on the public site. The 16 inline `style="…"` attributes across 6
      pages became classes in `global.css` (`.prose-column`, `.panel-gold`,
      `.split-narrow`, `.section-cta-lg`, `.eyebrow-azure`, `.honeypot`, `.form-alt`,
      `.error-lede`); the contact form's `is:inline` script became a processed one; and
      `vite.build.assetsInlineLimit: 0` in `astro.config.mjs` stops Astro inlining the
      bundled scripts, so every one is a hashed file under `/_astro` (already cached
      immutable). The inline JSON-LD stays: a script element with a non-JavaScript type
      is a data block that is never executed, so `script-src` does not apply to it.
- [x] **i18n: all five locales published — 🧑 human-led** *(large).* Done: locale
      routing (`src/pages/[...locale]/`), the dictionary + English-fallback
      system (`src/i18n/`), the language switcher, gated publishing (`complete:false`
      → noindex + out of sitemap/switcher), `hreflang` in each page's `<head>`, and
      **all page body copy authored in `en.json` and rendered via `t()`**. An offline
      DeepL helper (`npm run translate`, `DEEPL_API_KEY`) tops up `hr`/`bs`/`sr`; all
      five dictionaries carry all **178 keys** (verified 2026-08-23), including the
      brand string `YUnited` in the same 34 keys in every one. The card chrome (CTAs, alt text, date
      formatting, TBA placeholders) is localized too, and the board's **event
      content** — `content/events/` titles and descriptions — carries its own `i18n`
      block, filled by the Worker inside the same commit as every `/admin` save, with a
      nightly cron sweep behind it (see #59/#61 in §2); `npm run translate:content`
      is the CLI equivalent, for a maintainer's bulk work. **Board members
      are deliberately excluded**: a name, role and bio read the same in every
      language.
  - [x] **Serbian is Latin, and stays Latin.** `sr.json` used to be mixed — 34 Latin
        keys against 126 Cyrillic ones, under an `htmlLang` of `sr-Latn`. DeepL only
        emits Serbian in Cyrillic, so the fix is in the pipeline, not just the files:
        `toSerbianLatin()` in `scripts/lib/deepl.mjs` runs from `postProcess()` for
        the `sr` dictionary, so every future run converts on the way in. The same
        function was applied once to `sr.json` and to the `i18n.sr` block of all nine
        events. The only Cyrillic left on a Serbian page is the decorative
        `Događaji · Догађаји · Events` hero flourish, which is deliberate and appears
        in every locale.
  - [x] **All five locales published** (2026-07-28). `bs`/`hr`/`sr` flipped to
        `complete: true`: 40 sitemap entries (5 × 8 pages), full `hreflang`, all five
        in the switcher. The board reviews the translations **continuously and
        corrects in place** rather than gating on one end-to-end pass — an imperfect
        page in someone's own language beats no page at all. Known damage is fixed
        (HSG had been placed in *Edinburgh* and *New York*, the board inbox called a
        "forum", and "Meet & Greet" rendered as *"Srećem i pozdravljam"* — "I meet and
        I greet"). Hand corrections to an event's `i18n` block survive: it is
        re-translated only when `sourceHash` changes — and since #61 the board
        makes those corrections in `/admin` rather than in the JSON.
  - [x] **The copy is good as it stands, and further corrections are made by
        hand** (board judgement, 2026-08-07). The post-#50 hr/bs/sr dictionaries
        and all nine events' `i18n` blocks have been read and are considered
        sound — this closes the "reviews continuously" loop above with an actual
        verdict rather than leaving it open indefinitely. **Consequence for the
        DeepL item in §4:** its stage 6 `--force` run is a comparison instrument
        only, never a wholesale replacement, because `--force` is exactly the
        flag that bypasses the `sourceHash` gate protecting hand edits. Verified
        the same day: all 9 events carry a complete `de,hr,bs,sr` block with
        `sourceLang: en`, so there is no unfilled entry hiding behind the
        fallback.
- [~] **Partners / recruiting funnel** *(content + feature).* Sponsor/partner page
      and a recruiting flow. Scope with the board. Done: a `/partners` pitch page
      (`src/pages/[...locale]/partners.astro`) explaining why a company would
      partner with YUnited (community, event/social visibility, bridge to
      ex-Yugoslav-background employers) and pointing at the contact form's
      existing "Partnerships" topic — linked from the main nav and footer. No
      partner logos/names are listed (there are none yet; nothing was invented),
      and **`content/partners/` now exists as an empty collection** (2026-07-28):
      `partnerSchema` + a CMS collection + a logo strip on `/partners` that
      renders **only when there is at least one entry**, so adding the first real
      partner is a CMS save rather than a code change. Nothing is invented —
      the directory is empty and the page shows just the pitch until it isn't.
      Fields are `name`, `order`, optional `url`, optional `logo` (the name
      renders as text without one); no prose field and no `i18n` block, for the
      same reason as members. Remaining, and still needs the board: the
      **recruiting funnel**
      half (attracting new student members — likely a distinct feature with its
      own scope, possibly needing a form/backend this static site doesn't have
      yet) and the `/partners` copy and nav placement itself (first pass, not
      board-reviewed). The new strings **are** translated: `npm run translate`
      filled `de`/`bcs`/`sr` and the machine output was hand-corrected — it had
      again put HSG in *Edinburgh* (bcs), called the club a *tvrtka* (company),
      and mixed Latin letters into a Cyrillic word (sr). The Serbian partners
      strings were written in **Latin**, matching the `sr-Latn` tag and the
      existing Latin nav rather than the Cyrillic body copy (see the script
      item above).

- [x] **Guardrails: tests + a CI check for the invariants nothing else catches**
      (2026-07-28). Three failure modes here are *silent* — every command stays
      green while the site is wrong — so each now has an assertion:
  - `npm test` — `src/lib/events.test.js`, 14 cases over `splitEvents()` /
    `formatEventDate()` via `node:test` (built in; no framework, no new
    dependency). Covers the past/upcoming boundary (an event **today** is still
    upcoming), TBA floating, the same-date time tiebreak, missing/malformed
    times, non-mutation of the input, and day-first formatting in every published
    `dateLocale`. `now` is injected so the assertions never rot. Mutation-checked:
    making today count as past fails 2 cases, sinking TBA fails 1.
  - `npm run check:dist` — asserts on the **built** output that no `style="…"`
    attribute and no inline `<script>` survived (`application/ld+json` data blocks
    excepted, correctly), plus that rendered copy spells the brand `YUnited`. This
    is what stops a future edit, or an Astro upgrade changing an inlining default,
    from silently undoing the CSP work.
  - **A stale calendar now announces itself.** `content.js` warns at build time
    when no upcoming event has a date. Deliberately a *warning*: an empty calendar
    between semesters is legitimate and must never block a deploy. It is firing
    right now, which is correct — see §4's first open item.
  - `astro check` is at **0 errors, 0 warnings, 0 hints**. The 5 implicit-`any`
    hints were fixed at the source rather than at the call sites: `Event`/`Member`
    are derived from the Zod schemas with `z.infer` (so a schema change cannot
    drift from its type), `content.js` annotates its two exports, and
    `splitEvents()` is generic so it hands back whatever it was given.

- [x] **Dependencies current, 0 vulnerabilities** (2026-07-28). Astro **5 → 7**,
      Zod **3 → 4**, TypeScript **5 → 6**, plus `@astrojs/check` and `@sveltia/cms`.
      This turned out to be a **security** item, not housekeeping: `npm audit`
      reported 4 vulnerabilities including high-severity libvips CVEs in `sharp`
      (`<0.35.0`), reachable through the CMS image-upload path. `npm audit --omit=dev`
      had been reporting clean, which is misleading here — Astro and sharp are
      devDependencies but sharp still processes board uploads at build time. Now
      sharp 0.35.3 / libvips 8.18.3 and **0 vulnerabilities** in the full tree.
  - **TypeScript is pinned at 6.x on purpose, not out of caution.** TS 7's native
    compiler does not expose the programmatic API `astro check` needs, so `npm run
    check` fails outright on TS 7 — not a warning, a hard error. Upstream tracking:
    <https://github.com/withastro/roadmap/discussions/1321>. Revisit when that lands.
  - Zod 4 needed one change: `z.string().url()` is deprecated in favour of `z.url()`.
    All the board-facing validation messages were checked against a deliberately
    broken entry and come through unchanged.
  - The CSP invariants survived the major upgrade **and were verified rather than
    assumed** — `npm run check:dist` passes, the stylesheet is still an external
    `/_astro` file, and the page's one script is still `src`'d. This is exactly the
    regression that guard exists for.

- [x] **Translation runs on DeepL's free tier, not a paid Anthropic key —
      DONE, and it moved into the Worker.** *(The succession item.)* Shipped in
      two parts: PR #59 swapped the engine, and the follow-up moved the whole
      thing out of GitHub Actions and into `/admin` — because the engine was only
      half the problem. The machinery still lived behind a repo secret, in a
      workflow whose failures showed up only in GitHub's Actions tab, which is a
      surface no board member has an account for. That is why it failed unnoticed
      from 2026-07-30.

      **What the board has now:** an event is translated as it is saved, in the
      same commit (one rebuild, not two); each event's row badges its translation
      state; every event has a **Translations** page where the four languages can
      be read and corrected by hand, and a correction survives until the English
      text changes; a **Translate now** button; a **Translations tab** reporting
      whether the club's DeepL key still works, with live usage, where anyone on
      the board can paste a replacement key; and a nightly cron sweep in the same
      Worker that fills whatever a save missed.
      `.github/workflows/translate-content.yml` is deleted; the CLIs stay for a
      maintainer's bulk work.

      **The rules live in one place** — `src/lib/translate/content.js`, shared by
      the Worker and the CLI, because two copies of "does this need translating?"
      do not fail loudly, they re-translate over hand corrections. A latent bug
      was fixed on the way: an entry authored in anything but English could never
      be up to date and re-translated on every run — harmless at a yearly CLI run,
      a nightly rewrite of the board's corrections once a cron exists.

      **Verified:** hash parity checked inside workerd against all nine committed
      events, not just under Node; the panel checked in a browser at desktop
      width; `npm test` 129/129 then, **134/134** as of 2026-08-23. **The two
      out-of-band steps are now done** — `DEEPL_API_KEY` is a live Worker secret
      and the `ADMIN_SETTINGS` store exists and is bound, both verified
      2026-08-23 (§3). **Still not verified:** the panel at the 33rem
      breakpoint — screenshots and window resizing both failed through the
      browser extension, so it wants a look on a phone before anyone calls it
      finished. That is the one loose end left on this item.

      *The original entry follows, kept for its reasoning.* **Board
      decision, 2026-08-06.** The pipeline must not depend on a
      metered API account belonging to whoever is currently president. Anthropic's
      API is billed per token to a personal card; at the end of a presidency that
      key either walks out of the door with its owner — and automatic translation
      silently stops — or has to be re-issued and re-paid by the next board, who
      may not know it exists. DeepL's **free** tier is enough for the volume this
      club actually produces, so the club can run this indefinitely at no cost.
      See §3's struck-through `ANTHROPIC_API_KEY` item for what is degraded until
      this lands.

      **The volume, so nobody has to re-litigate whether the free tier fits**
      (counted from the actual files, 2026-08-06):

      | | chars |
      |---|---|
      | `en.json`, all 178 keys | 9,059 |
      | all 9 events (`title` + `description`) | 855 |
      | **one full re-translation of everything into 3 targets** | **~29,700** |
      | DeepL Free allowance | **1,000,000 / month** (measured 2026-08-07) |

      That is **~3%** of a single month's allowance to rebuild the entire site's
      copy from scratch. One `/admin` save re-translates one event — roughly 95
      characters into 4 targets, about 380 characters. This is not a squeeze; it
      is two orders of magnitude of headroom, and it is why "free tier" is a real
      answer here rather than a hopeful one.

      *(The 500,000 figure this table used to carry was wrong — the live
      `/v2/usage` endpoint reports `character_limit: 1000000`. Corrected
      2026-08-07, along with the 5.9% derived from it. The key already in the
      maintainer's local `.env` **is** a free-tier key — it ends in `:fx`, which
      is what `apiUrlFor()` switches on — and had used 25,014 of the million when
      checked, so no new account is needed to start.)*

      **What DeepL gave this repo before**, from the code #50 deleted — it is
      still recoverable and is the starting point, not a rewrite:

      ```bash
      git show 7306f15^:scripts/lib/deepl.mjs > scripts/lib/deepl.mjs
      ```

      It already contains the free/pro endpoint split (`apiUrlFor()` picks
      `api-free.deepl.com` when the key ends in `:fx`, so **a free key needs no
      code change**), the `<x>…</x>` protected-name wrapper, entity decoding, and
      `toSerbianLatin()`. The targets it used were `DE`, `HR` and `SR`.

      **The one structural problem — RESOLVED 2026-08-07, and it deletes a
      stage.** This item used to say there was **no `BS` target**, which is why
      the old repo fed a single shared `bcs.json` from `HR`, and why #50's central
      finding was that this shared file was overwhelmingly Croatian with stray
      Bosnian forms. The plan was therefore to derive `bs` from `hr` with a
      deterministic post-processor (`deriveBosnian()`), shaped like
      `toSerbianLatin()` and gated by the hr/bs lexis checks already in
      `validate.mjs`.

      **None of that is needed. `BS` is now a DeepL target.** Confirmed twice on
      2026-08-07 — against the published supported-language list and against the
      live API with this repo's own free-tier key, which returned `BS Bosnian`,
      `HR Croatian`, `SR Serbian` and `DE German` (plus, incidentally, `DE-CH`
      Swiss German). So **request `BS` directly**, exactly like the other three.
      No derivation, no word-list transform, no new tests for it — **stage 2 below
      is struck**. The `LANGUAGES.bs.rules` list in `glossary.mjs` stays where it
      is and keeps doing its real job: `validate.mjs` still enforces the hr/bs
      lexis split on the **output**, so if DeepL's `BS` turns out to be Croatian
      wearing a label, the gate fails the run rather than shipping the defect #50
      spent a whole PR removing. That check is now more load-bearing, not less.

      **What survives the engine swap untouched** — this is why the job is medium
      rather than large: `scripts/lib/validate.mjs` (the gate checks *output*, not
      process, so it does not care which engine produced the text),
      `scripts/lib/flat.mjs`, and the `TERMS`/protected-name policy in
      `glossary.mjs`. Only the *mechanism* for protecting terms changes — DeepL
      uses `tag_handling=xml` + `ignore_tags` with the `<x>` wrapper, where Claude
      was simply told in the prompt.

      **What genuinely regresses, stated plainly so the next board is not
      surprised.** DeepL cannot be *told* things. Claude received the whole
      dictionary plus the glossary in one request, and that is what fixed the
      context defects (`contact.formSending` coming back as the imperative
      "Pošalji…", `about.buddyMoreLink` glued into two nominatives because nothing
      said it follows the preposition "na"). DeepL translates string by string.
      Three mitigations, none a full replacement:
  - the **`context` parameter** — send adjacent keys / the surrounding sentence as
    untranslated context. It does **not** count toward the character quota.
  - ~~**DeepL glossaries** (API-managed term pairs) — pins one rendering per
    concept, which is the other half of what `glossary.mjs` does by prompt.~~
    **Not available for these languages. Checked 2026-08-07** against
    `/v2/glossary-language-pairs`: of this site's four targets, only **`de`**
    supports an en→ glossary. There is **no en→hr, en→bs or en→sr glossary**.
    So the one mitigation that would have pinned terminology mechanically is
    missing for **precisely the three languages whose terminology was the
    problem** — the other half of `glossary.mjs` cannot be handed to the API and
    stays a prompt-shaped policy with no engine to enforce it. Use a glossary for
    `de` if it helps; for hr/bs/sr, `context` and the validator are the whole
    story. Plan accordingly: this is the answer that went *against* the plan.
  - **the validator, which is the real net.** Every context defect that shipped in
    the DeepL era — `Pošalji…`, the glued preposition, four names for the buddy
    system, `Susret i upoznavanje` — now has a *named check* in `validate.mjs`,
    written afterwards, from the strings that actually shipped. That gate is the
    reason this migration is safe to attempt at all.

      **Stages.**
  0. [x] **Blocking check — DONE 2026-08-07.** Answers, as this item instructed
     they be recorded here: **(a) `HR` and `SR` are still targets** — yes, both.
     **(b) A `BS` target now exists** — yes; request it directly and skip the
     derivation, which strikes stage 2. **(c) Glossaries support EN→HR / EN→SR** —
     **no.** Only `de` among this site's targets has an en→ glossary pair. Method,
     so it can be repeated: the published supported-language list, then the live
     API with the free-tier key already in `.env` (`GET /v2/languages?type=target`
     and `GET /v2/glossary-language-pairs`; neither consumes quota). The
     assumption this stage existed to test — "DE/HR/SR and no BS, true as of #50" —
     **had in fact changed underneath the plan**, in both directions: one answer
     made the job smaller, one made it riskier.
  1. [x] **Done 2026-08-17.** Restored `deepl.mjs` from the commit before #50
     deleted it (`git show 7306f15^:scripts/lib/deepl.mjs`) and adapted it: the
     brand-protection list is now imported from `glossary.mjs`'s `PROTECTED`
     rather than kept as a second copy (the old file predated `glossary.mjs`
     and had its own), and `deeplBatch` — a many-texts-per-call helper — became
     a single-string `deeplTranslate`, because stage 3 calls DeepL **per
     string**, not in a batch (see stage 3). `toSerbianLatin`, `postProcess`
     (the `ß`/quoted-name/Cyrillic cleanup) and `apiUrlFor`
     (free-vs-pro endpoint by the `:fx` key suffix) carried over unchanged. Did
     **not** restore the old `translate.mjs` / `translate-content.mjs` — they
     predate both the bs/hr split and the gate — instead rewired the *current*
     ones in place (stage 3).
  2. ~~Add `deriveBosnian(hrText)` beside `toSerbianLatin()`, driven by the same
     word list `LANGUAGES.bs.rules` states, with unit tests in the existing
     `scripts/lib/*.test.js` style.~~ **Struck — stage 0(b): `BS` is a real
     target, so add it to the target list and derive nothing.**
  3. [x] **Done 2026-08-17.** `translate.mjs` and `translate-content.mjs` now
     import from `deepl.mjs` instead of the deleted `claude.mjs`; the grouping
     (`splitSentenceGroups`), gating (`checkDictionary`/`checkString`) and
     review-report flow are untouched. **One request per string, not per
     dictionary** — checked against DeepL's own docs (`context` is a single
     value for the whole request, not indexed per text, so a batched call
     could not give each string its own context) — with `context` built from:
     a hand-written `NOTES` entry (unchanged from the Claude version, e.g.
     `contact.formSending`'s "this is a status, not a command"), or, for a key
     inside a `Pre`/`Link`/`Post` group, the sentence joined back together; for
     content, an event's title and description are given to each other as
     context, so they translate as one event rather than two unrelated
     strings. `claude.mjs` **is deleted** — the "at the end, not the start"
     instruction meant during the rewiring, and it now has no caller: nothing
     outside it imports `@anthropic-ai/sdk`, which is why stage 5 could drop
     that dependency in the same PR. `glossary.mjs`'s `systemPrompt()`/
     `languagePrompt()` — the free-text instructions DeepL cannot take — went
     with it; `TERMS`/`MORPHOLOGY`/`ADDRESS_FORM` stay as the recorded policy
     and as what `validate.mjs` still checks on the output.
  4. [x] **Partly done 2026-08-17 — the unchanged half only.** `validate.mjs`
     itself has **zero code changes**. Ran it (via a throwaway script, not
     committed) against the *currently committed* `de`/`hr`/`bs`/`sr`
     dictionaries and all nine events' `i18n` blocks: **`hr`, `bs` and `sr` —
     the three locales this migration actually targets — are completely
     clean, 0 findings.** `de` is not: **15 errors**, all pre-existing and
     unrelated to this change — `de` is excluded from `DEFAULT_TARGETS` and
     was never previously run through this gate (`checkDictionary`/
     `checkString` didn't exist as a pre-write check until #50's Claude
     pipeline, which also excludes `de` by default). Two shapes of finding:
     (a) 13× `TERMS.buddySystem`'s forbidden stem `"buddy-"` matches German's
     own accepted compound **"Buddy-System"** — the forbidden list isn't
     scoped per language the way `canonical` is, so a legitimate German
     loanword trips a rule written against Croatian/Bosnian/Serbian output;
     worth a `validate.mjs` fix, but out of scope here (stage 4 says keep it
     unchanged) and `src/i18n/**` is a protected path regardless. (b)
     `movie-night-svadba-2026.json`'s German title reads "Filmabend – **Die
     Hochzeit**" — `Svadba` is `PROTECTED` for exactly this reason (glossary.mjs:
     "the film screened at Movie Night, not the common noun 'wedding'") and it
     is genuinely translated away here. **Not fixed in this PR** — `de.json`
     and `content/**` are hand-reviewed/board-owned, this PR is the engine
     swap, and fixing content on the back of an automated gate result is a
     different, human-reviewed change. Flagged for the board. The **"against
     the DeepL output"** half of this stage did not run — no `DEEPL_API_KEY`
     in the environment that did stages 1–5 — and is now folded into stage 6.
  5. [x] **Done 2026-08-17.** `.github/workflows/translate-content.yml`'s `env:`
     now reads `DEEPL_API_KEY: ${{ secrets.DEEPL_API_KEY }}` (the secret is
     still set, per §3/§4's earlier confirmation). `@anthropic-ai/sdk` is
     dropped from `devDependencies` (`npm uninstall @anthropic-ai/sdk
     --save-dev`, `package-lock.json` updated). The two loop guards in the
     workflow (`github.actor != 'github-actions[bot]'` and the
     `[auto-translate]` commit-message check) are untouched.
  6. **THE REMAINING STEP — needs a human with a real `DEEPL_API_KEY`; nothing
     else on this page is blocking it.** Stages 1–5 are done and merged (or
     open in this item's PR); `npm run translate -- --dry-run` already
     confirms the rewired script runs end to end and touches nothing without a
     key. What has never happened is a single real HTTP call to DeepL — no
     `DEEPL_API_KEY` existed in the environment that did stages 1–5, so the
     request shape (`deeplTranslate` in `scripts/lib/deepl.mjs`: `text`,
     `target_lang`, `source_lang`, `tag_handling: "html"`, `ignore_tags:
     ["x"]`, `context`) is implemented against DeepL's documented contract but
     has not actually been exercised. Before trusting it: re-translate
     everything with `--force` on a branch and **diff against the committed
     hr/bs/sr**, which are known-good Claude output. That diff is the real
     acceptance test — read it, do not just check that the run was green.

     **Do not merge that forced output wholesale.** Board decision, 2026-08-07:
     the currently committed hr/bs/sr copy is **judged good**, and from here on
     **corrections to it are made by hand**. So the `--force` run is a
     *measuring instrument*, not a migration step — it exists to show whether
     DeepL's output is as good as what is already committed. If it is merely
     equal, keep what is committed; a lateral rewrite of good copy buys nothing
     and costs the hand corrections. What DeepL is actually being adopted for is
     **new and changed content from here on** — a new event is ~95 characters,
     the easy case. Note the trap: `--force` is precisely the flag that bypasses
     the `sourceHash` gate protecting hand edits, so a forced run on `main`
     would silently overwrite exactly the corrections this decision creates.
     Keep it on a branch.

      **Verification — done 2026-08-17, everything not gated on a live key:**
      `npm test` (94/94 — 12 new cases cover `deepl.mjs`'s pure functions,
      including `toSerbianLatin`'s digraph casing, never unit-tested before
      this even though it shipped and ran in production pre-#50) · `npm run
      build` (41 pages) · `npm run check` (0/0/0) · `npm run check:dist` ·
      `npm run translate -- --dry-run` and `npm run translate:content --
      --dry-run`, both confirmed to write nothing without a key. **Still
      needed, and it is exactly stage 6:** a full `--force` run at 0 errors
      from `validate.mjs` against real DeepL output, `npm run build && npm run
      check:dist` on the result (which asserts **no Cyrillic on Serbian
      pages**, so the sr Latin conversion has to survive the swap in practice,
      not just in the unit test) · the workflow green on a real `/admin` save.

      **Risk — the honest one is quality, not mechanics.** The mechanics are about
      a day. Whether string-by-string DeepL, plus context, plus a glossary, plus
      the gate, produces copy the board is happy with is only answerable by
      reading the stage-6 diff. **If it is not good enough, that is a finding, not
      a failure** — write it down here and take option B.

      **Option B, the fallback — NOT TAKEN. Board decision, 2026-08-07: DeepL.**
      Recorded with its reasoning intact, because it stays the fallback if stage
      6's diff disappoints. It was: keep DeepL for `de` (German was never the
      problem) and re-translate hr/bs/sr **by hand, once**, using the board's own
      native speakers — 178 keys, an afternoon's work for a member, no key at
      all, and the most succession-proof option on this page.

      **Why the decision does not lose much of it.** The board also judged the
      committed hr/bs/sr copy **good as it stands** and will **correct it by
      hand** from here (see stage 6). That is Option B's substance arriving by a
      different route: the hand-written corpus already exists — #50 built it —
      and human judgement stays in the loop over it. What DeepL is being adopted
      for is the *incremental* case Option B also assigned to a machine, new
      events at ~95 characters each. The two options converged; what was actually
      declined is the *bulk re-translation by hand*, which is work #50 already
      did.

      **Succession note, which is the wider point.** The free tier fixes the
      *cost* half of this problem; it does not fix ownership. Issue
      `DEEPL_API_KEY` — and ideally `GITHUB_TOKEN` and `CF_API_TOKEN` too — from a
      **club-owned identity** (`yunited@shsg.ch`) rather than a personal account.
      Then a handover is a password change instead of a re-issue, and nothing on
      this page quietly expires when a president graduates.

      *Note for the weekly agent (§7): **this item is closed — do not pick it
      up.** It is `[x]`, not `[~]`; the stray `[~]` this note used to carry was
      written on 2026-08-17 when stage 6 was still outstanding, and #59/#61
      landed afterwards. Stages 1–5 shipped in #59; #61 moved the whole thing
      into the Worker, where a real DeepL call now happens on every board save
      with a live key (verified in production 2026-08-23, §3). Stage 6's
      `--force` comparison run against the committed hr/bs/sr was **deliberately
      never merged** and stays unnecessary: the board judged the committed copy
      good and corrects it by hand, so a lateral rewrite buys nothing. Historical
      note kept: this item touched `.github/workflows/**` and dependency files,
      so it was never eligible for auto-merge.*

- [ ] **Brand the Cloudflare Access login screen** — 🧑 human-led *(small,
      dashboard-only).* Right now the first thing a board member sees when they
      open `/admin` is an unbranded, generic Cloudflare sign-in page on a
      `cloudflareaccess.com` domain, which looks like a phishing page to someone
      who was told "go to yunited.ch/admin". **This is customizable**, and it
      needs no code and no deploy:

      > **Zero Trust → Reusable components → Custom pages → Access login page →
      > Manage.** You can set the **organization name**, a **logo**, a **custom
      > header and footer**, and a **background colour**.

      **The logo field wants a URL, and the club's artwork already is one** —
      `public/assets/` is copied verbatim into `dist/`, so nothing needs
      uploading or hosting anywhere:

      ```
      https://yunited.ch/assets/icon-512.png     ← use this one
      ```

      That is the red tile with the white "yu" (512×512 PNG). It is preferred
      over the wordmark at `/assets/yunited-logo.svg` because it **carries its
      own background**, so it survives whatever background colour is set, and
      because PNG support is certain where SVG's is not (Cloudflare documents the
      field but not its accepted formats). The wordmark's "nited" is near-black
      on transparent and **disappears on a dark background** — if you use it
      instead, set the background to the site's cream `#f4ecdd`.
      `/assets/*` is cached `max-age=86400` and is *not* immutable, so replacing
      the file later propagates within a day without a new filename.

      For the background colour and header/footer text, use the tokens at the top
      of `global.css` (`--color-paper: #f4ecdd`, `--color-red: #b3202c`) so the
      page matches the site. Two caveats, both from the
      Cloudflare docs: the settings are **account-wide, not per-application** —
      fine here, since this account fronts only YUnited — and a *fully custom
      HTML* login page is **not** documented as supported (custom HTML is
      documented for Access **block** pages, not the login page), so treat this
      as branding the Cloudflare page, not replacing it.
      Docs: <https://developers.cloudflare.com/cloudflare-one/reusable-components/custom-pages/access-login-page/>
      **Not verified against this account's dashboard yet** — the option's exact
      placement moves between Zero Trust UI revisions.

- [x] **Structured data for events (`schema.org/Event` JSON-LD)** (2026-08-10).
      `events.astro` now emits one `Event` JSON-LD block (`name`, `startDate`,
      `description`, `url`, and `location` when set) per **dated** upcoming
      event, localized the same way its `EventCard` renders — same pattern as
      `index.astro`'s existing `Organization` block: a data-block
      `<script type="application/ld+json">`, exempt from `script-src` per the
      CSP convention in `CLAUDE.md`. The shaping logic is a new pure function,
      `eventJsonLd()` in `src/lib/events.js` (5 new `npm test` cases: null for
      TBA, date+time vs date-only `startDate`, location omitted when unset, a
      malformed time treated as no time) — no new content field, no new
      dependency. `url` points at the localized `/events` page itself, since
      there is no per-event page. Verified against the built HTML with a
      temporary dated-event fixture (the live calendar has no dated upcoming
      event right now, so nothing renders on `main` until the board adds one —
      correct, matching the TBA-skip rule).

- [x] **"Add to calendar" (.ics) link on each dated, upcoming event** (2026-08-24).
      `icsDataUri()` in `src/lib/events.js` shapes one RFC 5545 `VEVENT` — `UID`,
      `DTSTAMP` (the one field that stays UTC), `SUMMARY`/`DESCRIPTION`/`LOCATION`
      escaped per §3.3.11 — into a `data:text/calendar` URI, returning `null` for
      a TBA event exactly like `eventJsonLd`. `DTSTART`/`DTEND` are **floating
      local time** (no `Z`, no `TZID`): the schema records no timezone and every
      event happens in St. Gallen, so a floating time is what every calendar app
      reads as "the device's local time" — correct for every attendee. A timed
      event defaults to a 2-hour block (no end time is stored); a date-only event
      becomes a whole-day `VALUE=DATE` entry with the end date one day later
      (RFC 5545's exclusive end), computed through `Date` wall-clock arithmetic so
      a late-night start or a month/year boundary rolls over correctly. `EventCard`
      renders it as a second link — `events.addToCalendar`, English-only for now
      like #64's empty-state keys, falls back automatically — next to the RSVP
      link, both now inside a `.card-actions` flex row so the "hold this at the
      bottom of the card" `margin-top: auto` lives on the wrapper instead of
      `.card-link` itself, which is what let two links share the same row without
      duplicating the rule. Never offered on a **past** event (nothing left to
      add), so it appears only where an upcoming event also has a date — none
      does right now, same live-calendar gap as the JSON-LD item above.
      **Verified:** `npm test` **143/143** (10 new cases: null for TBA, timed
      start/end 2h apart in floating local time, a 23:30 start rolling to the
      next calendar day, a date-only event's exclusive end date, a month
      boundary, RFC 5545 escaping of `,`/`;`/`\`/newline, missing-id UID
      fallback) · `build` (41 pages) · `check` 0/0/0 · `check:dist`. Rendering
      verified against the built HTML with a temporary dated+RSVP fixture (not
      committed, matching #54's precedent): both links land in one
      `.card-actions`, the calendar link's `href` decodes to a well-formed
      `VCALENDAR`, and `download="<id>.ics"` is set. Reverted the fixture and
      rebuilt clean: 0 occurrences of "Add to calendar" in `dist/events.html`,
      confirming nothing renders from real content until the board adds a dated
      upcoming event.

      **Follow-up, 2026-08-27 — the `data:` URI didn't work on iOS.** Reported
      by the board: "add to calendar" worked on desktop but not on iPhone.
      Cause: a `data:text/calendar` URI combined with `download="<id>.ics"` is
      exactly the shape iOS Safari doesn't hand to Calendar — it forces a
      raw-text download there instead of the native "Add to Calendar" sheet,
      which only appears when Safari **navigates** to a URL whose response is
      genuinely `text/calendar`. Desktop browsers are far more forgiving of a
      `data:` URI, which is why nobody had seen the gap before. Fixed by
      serving the `.ics` as an actual static file instead of embedding it in
      the page: `icsDataUri()` is now `icsCalendar()`, returning the raw ICS
      text (unchanged shaping logic — same RFC 5545 rules, same tests, just no
      more `data:` wrapper); a new dynamic endpoint,
      `src/pages/events/[id].ics.js`, prerenders one real file per dated event
      at `/events/<id>.ics` at build time (same mechanism as `/events.xml`,
      still no backend, still generated at build time — just reachable at a
      URL instead of embedded). `EventCard` now links straight to that path,
      with no `download` attribute — on desktop the browser still downloads it
      (from the URL's own `.ics` extension, so the filename is unchanged),
      and on iOS it triggers the native sheet instead. `public/_headers` pins
      `Content-Type: text/calendar; charset=utf-8` for `/events/*.ics`
      explicitly, rather than trusting Cloudflare's own extension-based guess
      — deliberately, even though a local check showed Astro's own preview
      server already infers the same type from the extension unprompted.
      **Verified:** `npm test` **147/147** (existing `icsDataUri` cases renamed
      to exercise `icsCalendar()` directly rather than decoding a `data:` URI,
      plus one new case for `icsHref()`) · `build` (41 pages, one `.ics` file
      per dated event — all 9 today, including `meet-and-greet-2026.ics` once
      it gained a real date via `/admin` mid-session) · `check` 0/0/0 ·
      `check:dist` · confirmed the rendered `<a>` has no `download` attribute
      and points at the real path · confirmed `/events/*.ics` is absent from
      the sitemap, same as `/events.xml`. **Not verified: an actual iPhone.**
      `astro preview` doesn't apply `public/_headers` (that's a Cloudflare-only
      mechanism), so the closest check available in this environment was
      confirming the built file's content and the header rule's syntax against
      Cloudflare's documented `_headers` behaviour — the real test is tapping
      the link on a deployed build.

- [x] **"Skip to main content" link** *(small, done 2026-08-27).* `BaseLayout.astro`
      now renders `<a href="#main-content" class="skip-link">` as the first
      element inside `<body>`, before `<Header>`, pointing at `id="main-content"`
      added to `<main>`. Visually hidden by default (`transform:
      translateY(-150%)`) and pinned above the sticky header (`z-index: 100` vs
      the header's `50`) the instant it receives focus (`.skip-link:focus`) —
      styled entirely in `global.css`, no `style="…"` attribute, per the CSP rule
      in `CLAUDE.md`. New i18n key `skipLink` added to `en.json` only (source of
      truth); other locales fall back to English until `npm run translate` fills
      them, same pattern as #64's `EmptyUpcoming` keys.
      **Verified:** `npm test` 143/143 · `build` (41 pages) · `check` 0/0/0 ·
      `check:dist`; confirmed in the built HTML (`en` and `hr`) that the link and
      `id="main-content"` render. Browser-checked programmatically (via
      `getComputedStyle`/`.focus()`) rather than a real Tab keypress — the
      browser-automation extension's synthetic key events did not advance
      document focus in this environment, a tool limitation rather than a page
      issue — confirming: default state translates the link fully off-screen,
      focus moves it to `top:8px,left:8px` (clear of the header), and blur
      reverses it via the CSS transition.

- [x] **RSS feed for events** (`/events.xml`) *(small, done 2026-08-27 — left
      open for human merge, see below).* `src/pages/events.xml.js`, non-localized
      like `404.astro`, generates the feed at build time from the same `events`
      export `src/lib/content.js` provides, via `@astrojs/rss` (the official
      Astro-maintained sibling of `@astrojs/sitemap`, already in use). One new
      pure function, `eventRssItem()` in `src/lib/events.js` (alongside
      `eventJsonLd`/`icsCalendar`): omits `pubDate` for a TBA event rather than
      guessing one, and folds date/location/description into the item body. TBA
      events lead the feed (same "floats to the top" rule as `splitEvents()`),
      dated ones follow newest-date-first — there's no last-modified timestamp
      anywhere in the schema, so an event's own date is the only proxy for "when
      did this become news". An RSS autodiscovery `<link rel="alternate"
      type="application/rss+xml">` was added to every page via
      `BaseLayout.astro`. **One new dependency** (`@astrojs/rss` — no new
      vulnerabilities per `npm audit`, still 7).
      **Verified:** `npm test` **146/146** (3 new cases) · `build` (41 pages,
      `events.xml` present separately) · `check` 0/0/0 · `check:dist` · the
      built `dist/events.xml` parses as valid XML with all 9 events, TBA
      *Meet & Greet* first with no `<pubDate>`, the rest newest-date-first.
      **Left open rather than auto-merged**: it adds a dependency, and §7 keeps
      dependency changes out of the weekly agent's auto-merge scope for the same
      reason — worth a human's look before it lands.

- [x] **`<link rel="preconnect">` to Formspree on the contact page** *(tiny,
      done 2026-08-27).* One line in `contact.astro`, via `BaseLayout`'s named
      `head` slot (the same mechanism #54 used for JSON-LD): `<link
      rel="preconnect" href="https://formspree.io" slot="head" />`. Renders only
      on `/contact` — confirmed absent from `dist/events.html`. No CSP change:
      `formspree.io` is already in `connect-src` and `form-action` for the
      form's own submit/fallback. **Verified:** `npm test` 143/143 · `build` (41
      pages) · `check` 0/0/0 · `check:dist`.

Deferred/among-these per the original roadmap: sitemap `hreflang` — shipped instead
as `<link rel="alternate" hreflang>` in the page `<head>` (gated to finished locales),
which Google treats as equivalent; no separate sitemap `hreflang` needed.

---

## 4.5 Ideas, not yet committed 💡

Parked here rather than in §4 because none is agreed work yet. The weekly agent
(§7) treats this section as **read-only** — it may propose *into* it, never
implement *from* it.

- **Test `worker/github.js`** *(M, no decision needed — the strongest purely
  technical item on this page).* It is 194 lines with no test file, and it is
  what makes `worker/index.js`'s promise to the board — *"nothing was changed"*
  on failure — actually true: the whole save is assembled and committed in one
  atomic ref update at the very end. Everything either side of it (`lib.js`,
  `collections.js`) is tested; this is the gap. Approach: `node:test` with an
  injected `fetch`, asserting the blob→tree→commit→ref order, that the ref update
  is **not** forced (a forced one would silently discard a concurrent save), and
  that `remove: true` emits a tree entry with a null sha. No network, per the
  testing rule in `CLAUDE.md`. Note it touches `worker/**`, which §7 forbids the
  agent from auto-merging — human review either way.

- **Recruiting funnel** — the unbuilt half of the `[~]` partners item above.
  **Needs the board to define what it means** before any code: a join form? a
  mailing list? an Instagram-driven signup? The cheapest real version adds a
  "Join / Membership" topic to the existing Formspree contact form and a CTA on
  `/join`, with no new backend and no new dependency — worth preferring unless
  the board wants something the static architecture genuinely can't do.

- **Turnstile on the contact form** *(deferred deliberately, 2026-07-29).* The
  form's only spam defence is the honeypot field. Reviewed and **left as is**:
  adding a third-party script to a site whose CSP is currently this clean is not
  worth it until spam actually appears. Revisit if the club inbox starts filling
  up or Formspree's monthly quota gets exhausted.

- **A "what's on" nudge when the calendar empties.** The build already warns when
  no upcoming event has a date, but only a developer running a build ever sees
  it. The board never does. If the empty-calendar problem recurs, the fix is to
  surface it where they'll see it, not to warn harder in the terminal.

---

## 5. Known cleanup / tech debt 🧹

- [x] **`npm audit` regressed, and nothing in CI would have said so** —
      **fixed 2026-08-27, left open for human merge.** Was **7 vulnerabilities —
      4 high, 3 moderate** (drifted 0 → 5 → 6 → 7 across four checks with
      nothing in CI ever saying so); now **0**. `npm audit fix` (no `--force`)
      resolved all seven within the existing `package.json` ranges — `wrangler`
      moved **4.114.0 → 4.127.0** (an upgrade, not the 4.35.0 downgrade the old
      text here warned against), plus patch bumps to `undici`, `fast-uri`,
      `js-yaml`, `nanoid`, `postcss`. `package.json` itself is unchanged; only
      `package-lock.json` moved. Added a **non-blocking** `npm audit
      --audit-level=high` step to `ci.yml` (`|| true`, so a future drift is
      *visible in every PR* without failing the build) — this is the fix for the
      actual finding, which was always the silence, not any one CVE.
      **Verified:** `npm test` 143/143 · `build` (41 pages) · `check` 0/0/0 ·
      `check:dist` (an Astro/wrangler bump changing something `check:dist`
      guards against is exactly the regression this step exists to catch) ·
      `npm audit` reports 0. **Left open rather than auto-merged**: touches
      `ci.yml` and dependency files, which §7 keeps out of the weekly agent's
      auto-merge scope for the same reason — a human should look before a
      dependency bump lands.

- [x] **A red CI run on `main` tells nobody** — **half-fixed 2026-08-27, left
      open for human merge.** Added `workflow_dispatch:` to `ci.yml`'s `on:`
      block (same PR as the audit step above, since both are the "assertions
      nobody sees" pattern), so `main` can now be re-checked on demand from the
      Actions tab or `gh workflow run ci.yml` — no more waiting for a new
      commit to find out whether a hosted-runner outage has cleared. **The
      other half — turning on failure notifications for the repo's Actions —
      is a GitHub account setting, not a file in this repo, and stays a human
      action item**, same shape as the Access-login-branding item in this
      section: nothing to verify with a command, needs a person in the
      repo/org settings.
      **Verified:** same four-command run as the audit item, since they share a
      PR; `workflow_dispatch:` is valid YAML (parsed with `js-yaml`, already a
      transitive dependency, rather than assumed).

- [x] **Documentation drift caught and fixed** (2026-07-29). Three places had
      fallen behind the code, all in the same direction — claiming `bs`/`hr`/`sr`
      were still unpublished, months after #37 made them live:
  - `README.md` said the site was *"available in English and German, with
    Bosnian/Croatian/Serbian in progress."* Now: published in five languages.
  - `EDITABLE-TEXT-FILES.txt` — a maintainer's personal cheat sheet for *which
    file do I open to change this text* — was **tracked in git while its own
    header said it wasn't**, and told the board that bs/hr/sr were `noindex` and
    hidden from the switcher. It is kept (it is genuinely useful for translation
    work) but is now **untracked and gitignored**, which is what it always
    claimed to be. Its content is deliberately left alone: as a local scratch
    file it can be as rough as its owner likes. The authoritative board-facing
    doc remains [`docs/ADMIN.md`](docs/ADMIN.md).
  - This file's §1 repo map had **no `worker/` entry at all** — the project's
    only server-side code, added in #44, was invisible to anyone (or any agent)
    orienting from the map. Added, with the per-file breakdown.

      The general lesson, and the reason this is logged rather than quietly
      fixed: **every one of these was a *second* copy of a fact that lives
      authoritatively somewhere else** — exactly the drift class #44 removed from
      the admin form. Prefer linking to `src/i18n/config.js` over restating what
      it says.

- [x] **`README.md` rewritten, `DEPLOY.md` deleted** (2026-07-24). README is now a
      front door for both audiences — board → `/admin` + `docs/ADMIN.md`; developers →
      commands, current content shape, i18n, deploy, repo map — linking out to
      CLAUDE.md / PLAN.md instead of duplicating them. `DEPLOY.md` was obsolete and
      partly wrong ("no build step"; `python3 -m http.server` preview) and nothing
      linked to it; its still-true deploy facts (push to `main` → Cloudflare, the
      dashboard-only build command, the `DEEPL_API_KEY` secret) moved into README.
- [x] **AVIF uploads now work** (2026-07-28, via the Astro 7 upgrade — sharp 0.35.3 /
      libvips 8.18.3). Verified end to end, not just from the format table: a real
      `.avif` file dropped into `src/images/` is decoded and optimized into the build
      like any other upload. **HEIC/HEVC is still unsupported** — libvips reports
      `heifsave: Unsupported compression` — so the clear board-facing error in
      `images.js` is still needed and still correct.
- [x] **Brand capitalization is consistent everywhere** (audited 2026-07-28). Copy,
      chrome and metadata all say **YUnited**, in all four dictionaries — the same 34
      keys in each, verified, with no all-caps or lowercase drift and none lost in
      translation. SVG `<title>`/`aria-label`, `site.webmanifest` and the CMS branding
      match. The logo artwork deliberately still *reads* "Yunited" and **stays as is**
      (the SVGs are drawn vector paths, so the letterforms can't be search-and-replaced
      anyway). Filenames, `yunited.ch`, `yunited@shsg.ch` and `@yunited.unisg` are
      lowercase and correct that way. The board has still not ruled on the final
      spelling; if it changes, the copy is a one-line `perl -pi -e 's/\bYUnited\b/…/g'`
      over the same file list as the rename commit.

---

## 6. Everyday commands

```bash
npm install        # once
npm run dev        # local preview at http://localhost:4321
npm test           # unit tests for src/lib + worker/ (node:test, no framework)
npm run build      # writes dist/ (runs prebuild: mirrors src/images)
npm run check      # astro check — must be 0 errors AND 0 hints
npm run check:dist # post-build: CSP-inline-free + brand spelling
npm run preview    # serve built dist/
npm run admin:dev  # wrangler dev — /admin + its Worker on :8787
```
"Verified" = all four of `test`, `build`, `check`, `check:dist` pass — which is
exactly what CI runs — and for content/render changes the expected text appears
in the built HTML (e.g. `grep "Karaoke Night" dist/events.html`).

---

## 7. Automation 🤖

A **weekly cloud agent** ("YUnited weekly roadmap agent") runs every **Monday
09:00 Europe/Zurich** (`0 7 * * 1` UTC). Manage/disable it at
<https://claude.ai/code/routines>.

Each run it takes the **first unchecked item that is not tagged 🧑 human-led** in §4
(or §5 if §4 is clear),
implements it on a branch, ticks it here, opens a PR, verifies with
`npm ci` + `test` + `build` + `check` + `check:dist` (all four, as CI does),
reviews its own diff, and **auto-merges only if CI
passes and nothing is contentious**. If §4 and §5 are both clear it switches to
proposing new ideas into §4 (and does *not* merge that PR).

**It will never auto-merge a change touching** `public/_headers`,
`public/admin/**`, `worker/**`, `.github/workflows/**`, `wrangler.jsonc`,
`astro.config.mjs`, `src/lib/schema.js`, dependency files, or any deletion/rename
under `content/` —
those it leaves open for a human. It never pushes to `main`, never weakens CI or
the schema to go green, and does one item per run.

**Nor may it weaken the guardrails to go green.** `scripts/check-dist.mjs`,
`src/lib/events.test.js`, `worker/*.test.js` and the CI steps that run them exist
because the failures they catch are otherwise invisible. Deleting a test, narrowing an assertion or
skipping a step is never the fix for a red build — the fix is the code that made
it red.

> **Keep this file accurate.** The agent decides what to do from §4/§5, so a
> stale checkbox means it redoes finished work or skips real work.
