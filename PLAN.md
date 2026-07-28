# PLAN.md — YUnited website: status, structure & roadmap

**Purpose.** One living document to see at a glance what the repo *is*, what's
**done**, what's **pending**, and what's **planned** — so neither the board nor an
AI assistant has to re-derive the layout by scanning every time. Keep it current:
when a step ships, tick it here in the same PR.

- **What this is:** the static website for **YUnited**, the Balkan / ex-Yu student
  club at the University of St. Gallen (HSG), served at **yunited.ch**.
- **Stack:** [Astro](https://astro.build) (build-time rendering) → static files →
  **Cloudflare Workers** static assets. No database, no server, no runtime JS data.
- **Deeper docs:** architecture & conventions → [`CLAUDE.md`](CLAUDE.md); CMS setup
  & usage → [`docs/CMS.md`](docs/CMS.md). This file is the *tracker/index*; those
  are the *reference*.

_Last updated: 2026-07-28 (**all five locales are live** — `bs`/`hr`/`sr` flipped
to `complete: true`, reviewed continuously rather than gated; Serbian is now
consistently **Latin**, enforced in the translation pipeline itself; `/partners`
pitch page merged (#36). Earlier: CSP hardened — no `'unsafe-inline'` left on the
public site; board members no longer machine-translated; 404 now actually served)._

---

## 1. Repository map

```
content/                 CONTENT LAYER — one JSON file per entry (board's edit surface)
  events/<id>.json         9 events; filename = the event id
  members/<role>.json      6 board members; each has an `order` (1 = lead card)
src/
  pages/[...locale]/*.astro 8 localized routes (index, about, events, members, exchange,
                           partners, join, contact); rest param emits both /events and /de/events
  pages/404.astro          not-found page (not localized)
  components/*.astro       EventCard, MemberLead, MemberRow, Portrait, PageToc, Header, Footer
  layouts/BaseLayout.astro single source of <head> (canonical + hreflang) + chrome + script
  i18n/                    locale registry (config.js), t()/fallback (utils.js), {en,de,
                           bcs,sr}.json dictionaries; en.json is the source of truth
  lib/                     build-time logic (framework-free, no Astro imports)
    content.js               loads + validates every content file (the choke point)
    schema.js                Zod schemas = authoritative shape of the edit surface
    events.js                upcoming/past split, date/time formatting & tiebreak
    members.js               display-name / placeholder / initial helpers
    images.js                resolveImage(): path -> optimized asset (any raster fmt/case)
  images/                  source images (go through sharp -> WebP at build)
    events/{25_26,26_27}/, members/
  styles/global.css        one stylesheet; all design tokens in :root at the top
public/                    copied verbatim into dist/
  admin/                   Sveltia CMS: index.html, config.yml (base_url -> auth worker)
                           (sveltia-cms.js is vendored at build, gitignored)
  _headers                 CSP + cache rules; scoped /admin CSP; /_astro immutable
  assets/                  logos, favicons, icons, motif, fonts/ (self-hosted woff2)
  robots.txt, site.webmanifest
scripts/vendor-cms.mjs     npm `prebuild`: copies Sveltia bundle into public/admin/
scripts/translate.mjs      npm `translate`: offline DeepL fill of i18n dictionaries (not in build)
scripts/translate-content.mjs  npm `translate:content`: fills the i18n block in content/**.json
scripts/lib/deepl.mjs      shared DeepL plumbing for both scripts (one PROTECT list)
.github/workflows/         ci.yml (build+check on PRs); translate-content.yml (auto-translate
                           content on push to main — needs the DEEPL_API_KEY secret)
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
| #16 | Fixed CMS toolbar icons rendering as text (allow Google Fonts in `/admin` CSP) |
| #17 | Image loader accepts **any raster format, any case**; HEIC gives a clear board-facing error |
| #18 | This tracker (`PLAN.md`) + `CLAUDE.md` pointer to it |
| #19 | **CI on every PR** — `npm ci` + `build` + `check` (Node 22); catches bad content before merge |
| #30 | Table-of-contents rail: legible over dark sections, bound to the content rather than the viewport |
| #33 | Board members no longer machine-translated (`memberSchema` forbids `i18n`); **404 actually served** (`not_found_handling`) with no dead `/de/404` hreflang; visible focus ring, real form-error announcement, no sideways scroll on narrow phones |

Earlier foundation (pre-#12): Astro migration + build-time image optimization.

---

## 3. Pending — human actions ⏳

Manual/account steps (code is in place).

- [x] **`DEEPL_API_KEY` added to the repository's Actions secrets** (2026-07-22) —
      the "Translate content" workflow reads it; it fails loudly if the secret is
      ever removed. *The site build never needs this and stays hermetic; the
      secret is deliberately NOT in the Cloudflare build settings, so a deploy
      can never depend on DeepL being reachable.* To rotate: update `.env`
      locally, then `gh secret set DEEPL_API_KEY`.
- [x] Deploy `sveltia-cms-auth` worker + GitHub OAuth app + secrets — login works.
- [x] **Google Search Console**: sitemap switched to `https://yunited.ch/sitemap-index.xml`.

_On demand (not a pending task): to give a new board member CMS access, add them
as a repo collaborator — steps in [`docs/CMS.md`](docs/CMS.md) §5._

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
      `.github/workflows/translate-content.yml` on every CMS save. **Board members
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
      and there is no content collection for partners — add one once the board
      has real partners to show, the same way `content/events`/`content/members`
      exist. Remaining, and still needs the board: the **recruiting funnel**
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

Deferred/among-these per the original roadmap: sitemap `hreflang` — shipped instead
as `<link rel="alternate" hreflang>` in the page `<head>` (gated to finished locales),
which Google treats as equivalent; no separate sitemap `hreflang` needed.

---

## 5. Known cleanup / tech debt 🧹

- [x] **`README.md` rewritten, `DEPLOY.md` deleted** (2026-07-24). README is now a
      front door for both audiences — board → `/admin` + `docs/CMS.md`; developers →
      commands, current content shape, i18n, deploy, repo map — linking out to
      CLAUDE.md / PLAN.md instead of duplicating them. `DEPLOY.md` was obsolete and
      partly wrong ("no build step"; `python3 -m http.server` preview) and nothing
      linked to it; its still-true deploy facts (push to `main` → Cloudflare, the
      dashboard-only build command, the `DEEPL_API_KEY` secret) moved into README.
- [ ] Current `sharp` build lacks **AVIF/HEVC decode** (AV1 works). AVIF *uploads*
      would fail; not worth acting on unless it comes up. HEIC handled via clear error.
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
npm install       # once
npm run dev       # local preview at http://localhost:4321
npm run build     # writes dist/ (runs prebuild: vendors the CMS bundle)
npm run check     # astro check — must be 0 errors
npm run preview   # serve built dist/
```
"Verified" = `build` succeeds, `check` is clean, and for content/render changes the
expected text appears in the built HTML (e.g. `grep "Karaoke Night" dist/events.html`).

---

## 7. Automation 🤖

A **weekly cloud agent** ("YUnited weekly roadmap agent") runs every **Monday
09:00 Europe/Zurich** (`0 7 * * 1` UTC). Manage/disable it at
<https://claude.ai/code/routines>.

Each run it takes the **first unchecked item that is not tagged 🧑 human-led** in §4
(or §5 if §4 is clear),
implements it on a branch, ticks it here, opens a PR, verifies with
`npm ci` + `build` + `check`, reviews its own diff, and **auto-merges only if CI
passes and nothing is contentious**. If §4 and §5 are both clear it switches to
proposing new ideas into §4 (and does *not* merge that PR).

**It will never auto-merge a change touching** `public/_headers`,
`public/admin/**`, `.github/workflows/**`, `wrangler.jsonc`, `astro.config.mjs`,
`src/lib/schema.js`, dependency files, or any deletion/rename under `content/` —
those it leaves open for a human. It never pushes to `main`, never weakens CI or
the schema to go green, and does one item per run.

> **Keep this file accurate.** The agent decides what to do from §4/§5, so a
> stale checkbox means it redoes finished work or skips real work.
