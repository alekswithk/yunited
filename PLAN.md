# PLAN.md — Yunited website: status, structure & roadmap

**Purpose.** One living document to see at a glance what the repo *is*, what's
**done**, what's **pending**, and what's **planned** — so neither the board nor an
AI assistant has to re-derive the layout by scanning every time. Keep it current:
when a step ships, tick it here in the same PR.

- **What this is:** the static website for **Yunited**, the Balkan / ex-Yu student
  club at the University of St. Gallen (HSG), served at **yunited.ch**.
- **Stack:** [Astro](https://astro.build) (build-time rendering) → static files →
  **Cloudflare Workers** static assets. No database, no server, no runtime JS data.
- **Deeper docs:** architecture & conventions → [`CLAUDE.md`](CLAUDE.md); CMS setup
  & usage → [`docs/CMS.md`](docs/CMS.md). This file is the *tracker/index*; those
  are the *reference*.

_Last updated: 2026-07-20 (through PR #17)._

---

## 1. Repository map

```
content/                 CONTENT LAYER — one JSON file per entry (board's edit surface)
  events/<id>.json         9 events; filename = the event id
  members/<role>.json      6 board members; each has an `order` (1 = lead card)
src/
  pages/*.astro            8 routes: index, about, events, members, exchange, join, contact, 404
  components/*.astro       EventCard, MemberLead, MemberRow, Portrait, Header, Footer
  layouts/BaseLayout.astro single source of <head> + header/footer + client script
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

Earlier foundation (pre-#12): Astro migration + build-time image optimization.

---

## 3. Pending — human actions ⏳

Manual/account steps (code is in place). **None currently open.**

- [x] Deploy `sveltia-cms-auth` worker + GitHub OAuth app + secrets — login works.
- [x] **Google Search Console**: sitemap switched to `https://yunited.ch/sitemap-index.xml`.

_On demand (not a pending task): to give a new board member CMS access, add them
as a repo collaborator — steps in [`docs/CMS.md`](docs/CMS.md) §5._

---

## 4. Planned ahead 🗺️ (roadmap, in suggested order)

Status: `[ ]` not started · `[~]` in progress · `[x]` done.

- [ ] **CI check on PRs** *(small, recommended next).* A GitHub Action running
      `npm run build` + `npm run check` on every PR. Now that the board commits via
      the CMS, this catches a bad edit *before* merge instead of only on Cloudflare's
      deploy. Highest safety-per-effort.
- [ ] **CSP hardening** *(medium).* Drop `style-src 'unsafe-inline'` from the public
      site by moving the inline `style="…"` attributes (6 pages) into `global.css`
      classes, and the inline JSON-LD / contact script into hashed/external form.
      The stylesheet is already CSP-clean; this finishes the job.
- [ ] **i18n: English + BCS** *(large).* Bosnian/Croatian/Serbian + English routing;
      adds `hreflang` to the (already generated) sitemap. Touches routing & layout —
      do after the two above.
- [ ] **Partners / recruiting funnel** *(content + feature).* Sponsor/partner page
      and a recruiting flow. Scope with the board.

Deferred/among-these per the original roadmap: sitemap `hreflang` (lands with i18n).

---

## 5. Known cleanup / tech debt 🧹

- [ ] **`README.md` and `DEPLOY.md` are stale** — they predate the Astro migration
      and CMS ("two small files", "no admin panel", "no build step"). Rewrite to
      describe: edit via `/admin` (or `content/**` files), `npm run build`, Cloudflare
      deploy. Point board members at `docs/CMS.md`.
- [ ] Current `sharp` build lacks **AVIF/HEVC decode** (AV1 works). AVIF *uploads*
      would fail; not worth acting on unless it comes up. HEIC handled via clear error.

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
