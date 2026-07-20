# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The website for **Yunited**, the Balkan / ex-Yugoslav student club at the University of St. Gallen (HSG), served at `yunited.ch`. It is a static site built with **Astro** and deployed on **Cloudflare** (Workers static assets).

## Commands

```bash
npm install        # once
npm run dev        # local preview at http://localhost:4321
npm run build      # writes the finished static site to dist/
npm run preview    # serve the built dist/ locally
npm run check      # astro check (type/diagnostics); must be 0 errors
```

There is no test suite. "Verifying a change" means `npm run build` succeeds, `npm run check` is clean, and — for content or rendering changes — the relevant text appears in the built HTML (e.g. `grep "Meet & Greet" dist/events.html`).

## Deploy

Cloudflare builds the repo with `npm run build` and serves `dist/` (`wrangler.jsonc` sets `assets.directory: "./dist"`). The build command must be configured in the Cloudflare Workers Builds settings — it is not in the repo. `public/_headers` carries the CSP and cache rules and is copied verbatim into `dist/`.

## Architecture

The load-bearing idea: **content is authored as JSON and rendered to static HTML at build time** — there is no client-side data fetching, no database, no CMS.

- `content/events/*.json` and `content/members/*.json` are the entire content layer — **one JSON file per entry** (an event's filename is its `id`; a member's is a slug of its role). The board edits these through the CMS (see below) or by hand; **this is the primary edit surface and each entry's field shape must stay stable.** Do not rename fields without cause.
- `src/lib/events.js` / `src/lib/members.js` hold the pure logic (date parsing, upcoming-vs-past split, TBA handling, placeholder detection) that runs at **build time**. This logic was previously client-side JS; keep it framework-free. Same-date events are ordered by `time` as a deterministic tiebreaker; members render in `order` order (lowest = the large lead card).
- `src/pages/*.astro` import the content through `src/lib/content.js` (never the raw JSON) and map it through components in `src/components/` (`EventCard`, `MemberLead`, `MemberRow`, `Portrait`). Astro auto-escapes interpolated values.
- `src/lib/content.js` globs every entry file, validates each against the Zod schemas in `src/lib/schema.js` at **build time**, and additionally checks event `id`↔filename match, id uniqueness and member `order` uniqueness. A missing/misspelled field, a non-date, a bad RSVP URL etc. fails `npm run build` with a message naming the file and field. `schema.js` is the authoritative description of the board's edit surface — keep it in lockstep with the JSON, and update it (not just the JSON) when the shape must change.
- `src/layouts/BaseLayout.astro` is the single source of truth for every page's `<head>`, the `<Header>`/`<Footer>`, the trailing motif divider, and the small client script (mobile nav toggle + reveal-on-scroll). **Shared chrome lives here once** — never reintroduce per-page copies of the header/footer/head.
- `src/styles/global.css` is one stylesheet, imported once by the layout. All colors, spacing, radius and shadows are CSS custom properties in the `:root` block at the top — change a value there, not scattered rules. One `.card` style is shared by events and members.

### Conventions that matter

- **Events are never marked "past" by hand.** `splitEvents()` compares each event's `date` to today. A `null`/missing date means "TBA" and renders as an upcoming card floated to the top (see `hasDate`).
- **URLs are extensionless.** Internal links use `/about`, not `/about.html`; `astro.config.mjs` sets `build.format: 'file'` so Cloudflare serves them, and the canonicals match. Keep new links extensionless.
- **Image paths in JSON are relative to `src/`.** A photo at `src/images/events/x.webp` is referenced in the JSON as `"images/events/x.webp"`. `src/lib/images.js` (`resolveImage`) maps that string to the imported asset via `import.meta.glob`, and Astro's `<Image>` optimizes it at build time — resized, 1×/2× srcset, hashed under `/_astro/`. A path with **no matching file fails the build** (this is intentional). Images live in `src/`, not `public/`, precisely so they go through the sharp pipeline.
- **`astro.config.mjs` sets `inlineStylesheets: 'never'`** deliberately, to keep the CSP free of `style-src 'unsafe-inline'` for the stylesheet. Don't flip it.

### CMS

The board edits content through **Sveltia CMS** at `/admin` — a Git-based CMS: every save is a commit to this repo, no database. Setup and usage live in [`docs/CMS.md`](docs/CMS.md).

- `public/admin/config.yml` describes the two collections and must stay in sync with `src/lib/schema.js` (widgets ↔ Zod). `public/admin/index.html` loads the CMS bundle.
- The Sveltia bundle is **vendored at build time** by `scripts/vendor-cms.mjs` (the npm `prebuild` step) from the pinned `@sveltia/cms` devDependency into `public/admin/sveltia-cms.js` (gitignored, never committed) — so it's served first-party under `script-src 'self'`, not from a CDN.
- `/admin` has its **own CSP** in `public/_headers` (it needs the GitHub API); the `! Content-Security-Policy` line drops the global policy for that path so the two aren't intersected. The public site's strict CSP is unchanged.

## Roadmap context

**[`PLAN.md`](PLAN.md) is the living status tracker** — the repo map, what's done (with PR numbers), pending human actions, and the ordered roadmap. Read it first for orientation, and tick items there in the same PR that ships them.

A phased improvement plan exists at `~/.claude/plans/compare-this-static-website-cryptic-key.md`. The Astro migration was Phase 1. Known deferred work: generated sitemap with hreflang, English + BCS i18n, a partners/recruiting funnel, and CSP/CI hardening. (Done: Phase 1 Astro migration, image optimization, generated sitemap, Zod content schemas, and the Sveltia Git-based CMS.) Check that plan before large structural changes so work aligns with the intended direction.
