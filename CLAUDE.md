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

- `content/events.json` and `content/members.json` are the entire content layer. The board edits these; **this is the primary edit surface and its shape must stay stable.** Do not rename fields or restructure these files without cause.
- `src/lib/events.js` / `src/lib/members.js` hold the pure logic (date parsing, upcoming-vs-past split, TBA handling, placeholder detection) that runs at **build time**. This logic was previously client-side JS; keep it framework-free.
- `src/pages/*.astro` import the JSON directly and map it through components in `src/components/` (`EventCard`, `MemberLead`, `MemberRow`, `Portrait`). Astro auto-escapes interpolated values.
- `src/layouts/BaseLayout.astro` is the single source of truth for every page's `<head>`, the `<Header>`/`<Footer>`, the trailing motif divider, and the small client script (mobile nav toggle + reveal-on-scroll). **Shared chrome lives here once** — never reintroduce per-page copies of the header/footer/head.
- `src/styles/global.css` is one stylesheet, imported once by the layout. All colors, spacing, radius and shadows are CSS custom properties in the `:root` block at the top — change a value there, not scattered rules. One `.card` style is shared by events and members.

### Conventions that matter

- **Events are never marked "past" by hand.** `splitEvents()` compares each event's `date` to today. A `null`/missing date means "TBA" and renders as an upcoming card floated to the top (see `hasDate`).
- **URLs are extensionless.** Internal links use `/about`, not `/about.html`; `astro.config.mjs` sets `build.format: 'file'` so Cloudflare serves them, and the canonicals match. Keep new links extensionless.
- **Image paths in JSON omit the `public/` prefix.** A photo at `public/images/events/x.webp` is referenced as `"images/events/x.webp"`; components prepend `/`. Images are **not** yet optimized (that is a planned phase) — they are served as-is from `public/`.
- **`astro.config.mjs` sets `inlineStylesheets: 'never'`** deliberately, to keep the CSP free of `style-src 'unsafe-inline'` for the stylesheet. Don't flip it.

## Roadmap context

A phased improvement plan exists at `~/.claude/plans/compare-this-static-website-cryptic-key.md`. The Astro migration was Phase 1. Known deferred work: image optimization (`<Image>`/srcset), Zod content-collection schemas + a Git-based CMS, generated sitemap with hreflang, English + BCS i18n, a partners/recruiting funnel, and CSP/CI hardening. Check that plan before large structural changes so work aligns with the intended direction.
