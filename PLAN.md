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

_Last updated: 2026-07-22 (through PR #22; i18n on `i18n-foundation` — German published,
BCS/Serbian still gated)._

---

## 1. Repository map

```
content/                 CONTENT LAYER — one JSON file per entry (board's edit surface)
  events/<id>.json         9 events; filename = the event id
  members/<role>.json      6 board members; each has an `order` (1 = lead card)
src/
  pages/[...locale]/*.astro 7 localized routes (index, about, events, members, exchange,
                           join, contact); rest param emits both /events and /de/events
  pages/404.astro          not-found page (not localized)
  components/*.astro       EventCard, MemberLead, MemberRow, Portrait, Header, Footer
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
astro.config.mjs           site, trailingSlash, build.format:'file', sitemap integration
wrangler.jsonc             Cloudflare: assets.directory = ./dist
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
- [ ] **CSP hardening** *(medium).* Drop `style-src 'unsafe-inline'` from the public
      site by moving the inline `style="…"` attributes (6 pages) into `global.css`
      classes, and the inline JSON-LD / contact script into hashed/external form.
      The stylesheet is already CSP-clean; this finishes the job.
- [~] **i18n: English + BCS — 🧑 human-led** *(large).* In progress on `i18n-foundation`. Done:
      locale routing (`src/pages/[...locale]/`), the dictionary + English-fallback
      system (`src/i18n/`), the language switcher, gated publishing (`complete:false`
      → noindex + out of sitemap/switcher), `hreflang` in each page's `<head>` (gated
      to finished locales — the equivalent of the sitemap approach), and **all page
      body copy authored in `en.json` and rendered via `t()`**. An offline DeepL
      helper (`npm run translate`, `DEEPL_API_KEY`) tops up `de`/`bcs`/`sr`; all four
      dictionaries now carry all 135 keys. **German is reviewed and published**
      (`complete: true`). The card chrome (CTAs, alt text, date formatting,
      TBA placeholders) is localized too, and the board's **content** —
      `content/**` titles, descriptions and bios — now carries its own `i18n`
      block, filled by `npm run translate:content` and kept current
      automatically by `.github/workflows/translate-content.yml` on every CMS
      save. Remaining, per locale:
  - [ ] **Serbian: pick one script.** `sr.json` is currently mixed — the hand-done
        nav/footer/meta (15 keys) are Latin, the DeepL body copy (101 keys) is
        Cyrillic, and `htmlLang` claims `sr-Latn`. Convert one way or the other
        (and fix `htmlLang` if Cyrillic wins) before publishing.
  - [ ] **BCS + Serbian: speaker review.** Raw DeepL output. The worst damage is
        fixed (it had placed HSG in *Edinburgh* and *New York*, and called the board
        inbox a "forum"), but nobody fluent has read either dictionary end to end.
        Flip `complete: true` in `src/i18n/config.js` only after that review.
- [ ] **Partners / recruiting funnel** *(content + feature).* Sponsor/partner page
      and a recruiting flow. Scope with the board.

Deferred/among-these per the original roadmap: sitemap `hreflang` — shipped instead
as `<link rel="alternate" hreflang>` in the page `<head>` (gated to finished locales),
which Google treats as equivalent; no separate sitemap `hreflang` needed.

---

## 5. Known cleanup / tech debt 🧹

- [ ] **`README.md` and `DEPLOY.md` are stale** — they predate the Astro migration
      and CMS ("two small files", "no admin panel", "no build step"). Rewrite to
      describe: edit via `/admin` (or `content/**` files), `npm run build`, Cloudflare
      deploy. Point board members at `docs/CMS.md`.
- [ ] Current `sharp` build lacks **AVIF/HEVC decode** (AV1 works). AVIF *uploads*
      would fail; not worth acting on unless it comes up. HEIC handled via clear error.
- [ ] **Brand capitalization is provisional — the board is deciding.** Copy, chrome
      and metadata now all say **YUnited**. The logo artwork deliberately still reads
      "Yunited" and **stays as is** for now (the SVGs are drawn vector paths, so the
      letterforms can't be search-and-replaced anyway — only their `<title>`/
      `aria-label` were updated). If the team lands on a different spelling, the copy
      is a one-line `perl -pi -e 's/\bYUnited\b/…/g'` over the same file list as the
      rename commit. Filenames, `yunited.ch`, `yunited@shsg.ch` and `@yunited.unisg`
      are lowercase and unaffected either way.

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
expected text appears in the built HTML (e.g. `grep "Casino Night" dist/events.html`).

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
