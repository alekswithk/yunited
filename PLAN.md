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

_Last updated: 2026-07-29 (status review — no code changed. **The engineering
backlog is empty**: 0 open issues, 0 open PRs, 0 `TODO`/`FIXME` in source, clean
tree, and all four verification commands green — `npm test` 35/35, `build`,
`check` at 0/0/0, `check:dist` — with `npm audit` clean across the whole 438-package
tree. #37–#49 all landed on 2026-07-28: all five locales live, Astro 7 / Zod 4 /
TS 6, the guardrail suite, the empty partners collection, Sveltia replaced by the
first-party `/admin` + Worker, and the motif/reveal motion fixes._

_**The live items are not code.** (1) **`ANTHROPIC_API_KEY` is not set yet.**
The bs/hr/sr copy has already been re-translated and is clean through the gate,
so nothing is waiting on it today — but the key is what lets the pipeline run
**unattended**, which is how a board member's `/admin` save gets localized
without a person present. Until it exists, a new event saves and publishes in
its authored language and its translations are simply not filled. (2) The 26/27
calendar is empty — every dated event is in the past,
so Upcoming shows one TBA card; the build warns about it and is warning right
now. (3) The `GITHUB_TOKEN` expires **end of August 2026** and must be replaced
before then, or `/admin` stops saving. All three in §3. New ideas are parked in
§4.5.)_

---

## 1. Repository map

```
content/                 CONTENT LAYER — one JSON file per entry (board's edit surface)
  events/<id>.json         9 events; filename = the event id
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
  lib.js                   slugify, coerceField, buildEntry, image paths
  {collections,lib,board-access}.test.js  `npm test` — form↔schema parity, carry,
                           coercion, lockout rails, non-destructive group writes
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
scripts/translate.mjs      npm `translate`: offline Claude fill of i18n dictionaries (not in build)
scripts/translate-content.mjs  npm `translate:content`: fills the i18n block in content/**.json
scripts/lib/glossary.mjs   THE translation policy: protected names, one pinned term per
                           concept per language, variant/morphology rules, address form
scripts/lib/claude.mjs     one request per language, whole dictionary at once (the fix)
scripts/lib/validate.mjs   the gate — nothing is written until it passes
scripts/lib/validate.test.js  `npm test`; cases are strings that actually shipped
scripts/lib/flat.mjs       flat <-> nested dictionary conversion, in one place
.github/workflows/         ci.yml (test+build+check+check:dist on PRs); translate-content.yml
                           (auto-translate content on push to main — needs ANTHROPIC_API_KEY)
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

Earlier foundation (pre-#12): Astro migration + build-time image optimization.

---

## 3. Pending — human actions ⏳

Manual/account steps (code is in place).

- [ ] **`ANTHROPIC_API_KEY` must be added to the repository's Actions secrets**
      — 🧑 human. The existing copy is already re-translated and clean, so this is
      not blocking the site today. What it unblocks is the **unattended** path:
      the workflow that localizes each `/admin` save with no human present. It
      replaced `DEEPL_API_KEY` (which can be deleted once this is in place): DeepL
      translated one string at a time with no context, which is what produced a
      buddy system described as a *mating* system and a submit button whose
      in-flight label read as the imperative "Send". The "Translate content"
      workflow reads it and fails loudly if it is missing. *The site build never
      needs this and stays hermetic; the secret is deliberately NOT in the
      Cloudflare build settings, so a deploy can never depend on a translation
      API being reachable.*

      ```bash
      gh secret set ANTHROPIC_API_KEY     # and paste it into a local .env too
      gh secret delete DEEPL_API_KEY      # once the above is set
      ```

      Note this is now the **second** credential on this page — see the
      `GITHUB_TOKEN` item below, which expires end of August 2026. Worth
      recording both expiries in one place.
- [x] ~~Deploy `sveltia-cms-auth` worker + GitHub OAuth app + secrets~~ — obsolete;
      Sveltia and its auth worker were removed. Access + one Worker secret replaced them.
- [x] **Google Search Console**: sitemap switched to `https://yunited.ch/sitemap-index.xml`.

- [ ] **Add the 26/27 events when the dates are set** — 🧑 board. As of 2026-07-28
      every dated event is in the past (the newest is 2026-05-13) and "Upcoming"
      shows only the TBA *Meet & Greet* card, so the site reads as dormant going
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

- [ ] **`GITHUB_TOKEN` expires END OF AUGUST 2026 — replace it before then** —
      🧑 human. **This is the deadline item on this page.** When it lapses the
      board loses the only way to publish: every save fails, `/admin` says so
      explicitly (502 naming the missing permission) and GitHub emails the token
      owner in advance, but nothing else warns anyone. The plan is to replace it
      with a **non-expiring** fine-grained PAT so this stops being a recurring
      deadline — issued on `alekswithk/yunited` with `Contents: Read and write`
      and nothing else, then:

      ```bash
      npx wrangler secret put GITHUB_TOKEN
      ```

      A save from `/admin` immediately afterwards confirms it (the commit shows
      up in this repo's history within seconds). Full steps, and what each
      failure message means, in [`worker/README.md`](worker/README.md).
      **When it is replaced, tick this box and note the date here** — a
      non-expiring token turns this from a recurring task into a one-off.

- [ ] **Verify the `/admin` Access tab in production — 🧑 human** *(small).* The
      Cloudflare side is done: the `yunited-board` rule group exists, the `/admin`
      policy includes it instead of a literal email list, `CF_API_TOKEN` is set as
      a Worker secret, and `CF_ACCESS_GROUP_ID` is filled in. **The tab goes live
      with the next deploy** — this item is the check that it actually works, in
      this order:

      1. Hard-refresh `/admin`; the **Access** tab is next to Partners.
      2. **The list matches the Zero Trust group exactly.** A wrong-but-valid
         group UUID shows somebody else's group, or an empty list, with no error —
         this is the only check that catches it.
      3. Add a throwaway address, confirm it in Zero Trust, sign in as it in a
         private window, then remove it and confirm sign-in now fails.
      4. `npx wrangler tail` during one change: the log line must name *your*
         email. Cloudflare's own logs only ever name the shared token, so that
         line is the whole per-person audit trail.

      **Worth knowing about the token:** Cloudflare has no groups-only permission,
      so it can also write the account's identity providers and Zero Trust
      settings — wider than `GITHUB_TOKEN`. Accepted deliberately; the fallback is
      to delete the secret, which returns `/admin` to exactly what it was.

_On demand (not a pending task): board members add and remove each other in the
`Access` tab at `/admin`; a change takes effect in seconds. The break-glass path,
if nobody can get in at all, is Cloudflare Zero Trust → Access → Groups →
`yunited-board` — steps in [`docs/ADMIN.md`](docs/ADMIN.md)._

---

## 4. Planned ahead 🗺️ (roadmap, in suggested order)

Status: `[ ]` not started · `[~]` in progress · `[x]` done.
Items tagged **🧑 human-led** must NOT be auto-implemented by the weekly agent (§7) —
they carry design decisions that need a person. The agent skips them.

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
      DeepL helper (`npm run translate`, `DEEPL_API_KEY`) tops up `de`/`bcs`/`sr`; all
      four dictionaries carry all **177 keys**, including the brand string `YUnited`
      in the same 34 keys in every one. The card chrome (CTAs, alt text, date
      formatting, TBA placeholders) is localized too, and the board's **event
      content** — `content/events/` titles and descriptions — carries its own `i18n`
      block, filled by `npm run translate:content` and kept current automatically by
      `.github/workflows/translate-content.yml` on every `/admin` save. **Board members
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
        I greet"). Hand corrections to an event's `i18n` block survive: the workflow
        re-translates only when `sourceHash` changes.
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
