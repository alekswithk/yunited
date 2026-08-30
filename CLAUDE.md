# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The website for **YUnited**, the Balkan / ex-Yugoslav student club at the University of St. Gallen (HSG), served at `yunited.ch`. It is a static site built with **Astro** and deployed on **Cloudflare** (Workers static assets).

## Domain notes

Two subsystems are complex and cleanly bounded enough to have their own reference — read the relevant one **before** working in that area, and keep it current in the same change:

- **[`docs/domains/buddy.md`](docs/domains/buddy.md)** — the buddy / kumstvo system: `src/lib/buddy/**`, `worker/buddy*.js`, the `/buddy` pages, the D1 store, the `/admin` Buddy tab, the emails.
- **[`docs/domains/translate.md`](docs/domains/translate.md)** — the translation / i18n pipeline: `src/lib/translate/**`, `worker/translate.js`, `scripts/translate*.mjs`, `src/i18n/**`, event-content translation.

Each has a thin agent wrapper in `.claude/agents/` (`buddy`, `translate`) that just loads its doc and states the boundary. Everything not covered by a domain doc is governed by this file.

## Commands

```bash
npm install        # once
npm run dev        # local preview at http://localhost:4321
npm run build      # writes the finished static site to dist/
npm run preview    # serve the built dist/ locally
npm run check      # astro check (type/diagnostics); must be 0 errors AND 0 hints
npm test           # node:test unit tests for src/lib and worker/ (no framework, no network)
npm run check:dist # post-build assertions on dist/ (CSP-inline-free, brand spelling)
npm run admin:dev  # wrangler dev — the admin panel + its Worker on :8787
```

**Tests cover `src/lib` and `worker/` only, and that is deliberate.** Pages and components are verified by building them. What gets tested is the code whose bugs are *invisible*: get the past/upcoming boundary in `src/lib/events.js` wrong, or the blank-value coercion in `worker/lib.js`, and every command still passes while the site shows the wrong thing or the panel commits something the next build rejects. Both use `node:test` (built in, no framework, no new dependency) and inject `now` so the assertions do not rot. Add tests there when you add logic to either; don't add a test runner for the rest.

"Verifying a change" means `npm test`, `npm run build`, `npm run check` and `npm run check:dist` all pass — that is exactly what CI runs — and, for content or rendering changes, the relevant text appears in the built HTML (e.g. `grep "Meet & Greet" dist/events.html`).

**For layout and CSS changes that is not enough, and the four commands cannot tell you so.** None of them renders a page: `check:dist` greps the built HTML for CSP violations, brand spelling and image resolution, and never opens anything. Overlap, wrapping, sticky and stacking behaviour are all invisible to every command in this repo — the same shape of blind spot that `src/lib/translate/validate.js` exists to cover for translations, where `test`, `build`, `check` and `check:dist` all passed for months while the About page described the buddy system as a *mating* system. So a change to layout also needs **a browser pass at the widths its breakpoints name, in a locale with long labels** — `npm run dev`, then look. hr/bs are the long-label locales: the TOC's `toc.buddy` is "Sustav/Sistem prijatelja" (17ch) against "Buddy system" (12ch) in English, so `/hr/about` breaks a rail before `/about` does.

**A claim in a code comment is not verification.** The `--toc-width` comments in `src/styles/global.css` asserted a longest label of "Buddy-System" and shipped in PR #55 having never been rendered; the actual longest label is half again as wide and in a different language. If a comment asserts rendered behaviour, either check it in a browser or say plainly that it is derived and unchecked.

## Deploy

Cloudflare builds the repo with `npm run build` and serves `dist/` (`wrangler.jsonc` sets `assets.directory: "./dist"`). The build command must be configured in the Cloudflare Workers Builds settings — it is not in the repo. `public/_headers` carries the CSP and cache rules and is copied verbatim into `dist/`.

The admin Worker (`worker/`) is part of the **same** Worker: `wrangler.jsonc` sets `main: "worker/index.js"` and `assets.run_worker_first: ["/admin/api/*", "/buddy/api/*"]`, so only those paths invoke code and everything else is served statically exactly as before. It deploys with the site — there is no second deploy. Its `GITHUB_TOKEN` is an encrypted Worker secret set out-of-band; the buddy system adds a `BUDDY_DB` D1 binding and a `RESEND_API_KEY` secret — see [`worker/README.md`](worker/README.md) and [`docs/domains/buddy.md`](docs/domains/buddy.md).

## Architecture

The load-bearing idea: **content is authored as JSON and rendered to static HTML at build time** — there is no client-side data fetching and no database *for content*. The main piece of server-side code is the admin API (`worker/`), which writes those JSON files; it runs when the board saves, never when a visitor loads a page. The **buddy / kumstvo system** is the one exception to both halves of that: it keeps per-student signups in a **Cloudflare D1** database and its public `/buddy/api/*` endpoints in the same Worker *do* run on visitor requests (confirming a signup, loading a pair page). It is cleanly bounded and has its own reference — [`docs/domains/buddy.md`](docs/domains/buddy.md).

- `content/events/*.json` and `content/members/*.json` are the entire content layer — **one JSON file per entry** (an event's filename is its `id`; a member's is a slug of its role). The board edits these through `/admin` (see below) or by hand; **this is the primary edit surface and each entry's field shape must stay stable.** Do not rename fields without cause.
- `src/lib/events.js` / `src/lib/members.js` hold the pure logic (date parsing, upcoming-vs-past split, TBA handling, placeholder detection) that runs at **build time**. This logic was previously client-side JS; keep it framework-free. Same-date events are ordered by `time` as a deterministic tiebreaker; members render in `order` order (lowest = the large lead card).
- `src/pages/*.astro` import the content through `src/lib/content.js` (never the raw JSON) and map it through components in `src/components/` (`EventCard`, `MemberLead`, `MemberRow`, `Portrait`). Astro auto-escapes interpolated values.
- `src/lib/content.js` globs every entry file, validates each against the Zod schemas in `src/lib/schema.js` at **build time**, and additionally checks event `id`↔filename match, id uniqueness and member `order` uniqueness. A missing/misspelled field, a non-date, a bad RSVP URL etc. fails `npm run build` with a message naming the file and field. `schema.js` is the authoritative description of the board's edit surface — keep it in lockstep with the JSON, and update it (not just the JSON) when the shape must change.
- `src/layouts/BaseLayout.astro` is the single source of truth for every page's `<head>`, the `<Header>`/`<Footer>`, the trailing motif divider, and the small client script (mobile nav toggle, the language switcher's outside-click, and one rAF-throttled scroll pass that drives the TOC scroll spy and the dark-section backdrop sync). **Shared chrome lives here once** — never reintroduce per-page copies of the header/footer/head. **There is no reveal-on-scroll JavaScript** — entrance motion is CSS scroll-driven animation; see the motion convention below.
- `src/styles/global.css` is one stylesheet, imported once by the layout. All colors, spacing, radius and shadows are CSS custom properties in the `:root` block at the top — change a value there, not scattered rules. One `.card` style is shared by events and members.

### Conventions that matter

- **Events are never marked "past" by hand.** `splitEvents()` compares each event's `date` to today. A `null`/missing date means "TBA" and renders as an upcoming card floated to the top (see `hasDate`).
- **URLs are extensionless.** Internal links use `/about`, not `/about.html`; `astro.config.mjs` sets `build.format: 'file'` so Cloudflare serves them, and the canonicals match. Keep new links extensionless.
- **Image paths in JSON are relative to `src/`.** A photo at `src/images/events/x.webp` is referenced in the JSON as `"images/events/x.webp"`. `src/lib/images.js` (`resolveImage`) maps that string to the imported asset via `import.meta.glob`, and Astro's `<Image>` optimizes it at build time — resized, 1×/2× srcset, hashed under `/_astro/`. A path with **no matching file fails the build** (this is intentional). Images live in `src/`, not `public/`, precisely so they go through the sharp pipeline.

  `scripts/mirror-media.mjs` (part of `prebuild`/`predev`) additionally copies `src/images/**` to `public/images/**`, gitignored, so the originals are *also* served at `/images/…`. **This is only for `/admin`**, which shows each entry's current photo by fetching its public URL — without it every thumbnail in the admin panel is a broken image. No page ever links there; pages use the hashed `/_astro/` copies, so no visitor downloads the originals. Because the content JSON stores paths relative to `src/` (`images/events/x.webp`), mirroring the tree as-is makes that same string work verbatim as a URL — don't flatten it. `npm run check:dist` asserts every content image resolves.
- **Entrance motion is CSS scroll-driven animation, and four details in it are load-bearing.** The hero load is an orchestrated sequence (header rule draws across → headline uncovered by a retracting curtain → standfirst → buttons → motif strip) and everything below it moves on `animation-timeline: view()`: section heads rise, cards land with `card-in` (26px, 1.5° of rotation coming out), and their photographs settle out of a 1.07 over-scale across roughly twice the card's range. No JavaScript ships for any of it — no `IntersectionObserver`, no `scripting: enabled` gate, no class on any component, and **`.reveal` is deleted; do not bring it back.** The `@supports (animation-timeline: view())` guard *is* the fallback: a browser without scroll timelines never parses the rules, so content is simply present and can never be stranded at `opacity: 0`. What breaks silently if you touch it: **(1)** ranges are `cover`, not `entry` — an `entry` range is as long as the element is tall, so a one-line eyebrow finishes in ~20px of scroll while a lead card takes 400px. **(2)** `card-in`/`photo-settle` animate the individual `translate`/`rotate`/`scale` properties, never `transform` — an animation holds its final value above any normal declaration, so a `to { transform: none }` outranks `.card:hover { transform: translateY(-3px) }` and kills the hover lift site-wide. **(3)** `.card` and `.card-image` are `overflow: clip`, not `hidden` — `hidden` makes a box a scroll container, which re-parents the photo's `view()` timeline to its own frame and freezes the animation at one frame. **(4)** longhands only, never the `animation:` shorthand — the minifier folds a shorthand in a way browsers discard entirely, and `check:dist` fails on a folded one. The reasoning is written out in full next to each rule in `global.css`; read it before changing a number. Layout and motion changes still need a browser pass (see above) — none of the four commands renders a page.
- **The CSP in `public/_headers` carries no `'unsafe-inline'`, and two build settings are what hold that up.** `astro.config.mjs` sets `inlineStylesheets: 'never'` (no `<style>` in the page) and `vite.build.assetsInlineLimit: 0` (every `<script>` is emitted as a hashed file under `/_astro` instead of being inlined). Don't flip either. The same rule applies to what you author: **no `style="…"` attributes and no `<script is:inline>`** — put the declarations in `global.css` and let Astro bundle the script. Inline `<script type="application/ld+json">` is fine: a non-JS script type is a data block, never executed, so `script-src` never applies to it. Neither `astro build` nor `astro check` fails if you break this — the page just silently stops working in a browser that enforces the header — so **`npm run check:dist` asserts it on the built output** and CI runs it on every PR. Run it after touching markup, or after changing anything in `astro.config.mjs`.

### The admin panel

The board edits content at `/admin`: a first-party form plus a Cloudflare Worker that commits to this repo. Every content save is a commit; no database. (The panel's **Buddy tab** is the exception — it reads and writes the D1 store, not the repo; that tab and its Worker routes are covered by [`docs/domains/buddy.md`](docs/domains/buddy.md).) Board-facing usage is [`docs/ADMIN.md`](docs/ADMIN.md) and the in-page help panel; the maintainer reference is **[`worker/README.md`](worker/README.md)** — read that before changing anything under `worker/`.

It replaced **Sveltia CMS** in the same change. The history is worth knowing, because two of the reasons are architectural:

- **`worker/collections.js` is the single description of the form.** The page fetches it from `GET /admin/api/state` and renders whatever it is given, and the Worker validates submissions with the actual Zod schemas from `src/lib/schema.js`. Sveltia's `config.yml` was a *second* description that had to be hand-synced with the schema, and drift was invisible until a save failed or a build broke — which is exactly what happened: Sveltia wrote `image: "/images/…"` (its `public_folder` prepended) where the schema requires no leading slash, and four events silently failed the build. **Never reintroduce a second copy of the field list.** To add a field: change `schema.js`, add the entry to `collections.js`, run `npm test`.
- **Authentication is Cloudflare's job, not this codebase's.** A Cloudflare Access application fronts `yunited.ch/admin` (and therefore `/admin/api/*`, which is why the API lives under that prefix). **There is no login code here and there should not be one.** `worker/access.js` only reads the forwarded identity, plus an optional signature check.
- **Membership is a different thing, and the panel does edit it.** The allow-list lives in an Access *rule group*; the `/admin` policy includes that group, and `worker/board-access.js` rewrites the group's email rules so the board can add and remove each other from the Access tab instead of the Zero Trust dashboard. This is not a hole in the rule above: adding an address grants nothing until that person passes Access's own login. Keep the two apart when changing either — and keep the server-side lockout rails in `guardChange` (you cannot remove yourself; you cannot empty the list) and the log line naming the actor, which is the only per-person audit trail Cloudflare's own logs do not provide.
- The GitHub token is an encrypted Worker secret and **never reaches the browser**; the panel talks only to `/admin/api/*` on its own origin.
- `/admin` has its **own CSP** in `public/_headers`, as strict as the public site's (the `! Content-Security-Policy` line drops the global policy for that path so the two aren't intersected — Cloudflare would otherwise combine them). It differs only in allowing `blob:` images, for the local photo preview. `npm run check:dist` polices `/admin`'s markup like every other page, and additionally fails if anything under `public/admin/` references an off-site origin.
- **An entry's `i18n` block must survive every save** — see `carry` in `collections.js`. A Git-based editor writes back only the fields it knows about, so omitting it silently strips every translation.

### i18n

Pages live under `src/pages/[...locale]/` — a **rest parameter that matches zero segments**, so one file emits both the English route (`/events`) and every localized one (`/de/events`). Never duplicate a page per language.

- `src/i18n/config.js` is the locale registry and the only place locales are defined. `localePaths()` feeds every page's `getStaticPaths`; `localizePath(path, code)` builds locale-aware hrefs — **use it for every internal link**, including in page bodies. On default-locale pages `Astro.params.locale` is `undefined`, which `localizePath`/`getLocale` treat as English.
- `src/i18n/{en,de,hr,bs,sr}.json` are the dictionaries; `useTranslations(locale)` returns `t("dotted.key")` and **falls back to English** for anything missing, so an unfinished locale still renders a complete page. `en.json` is the source of truth — add every new string there first. Strings that contain inline markup (links, `<strong>`) are rendered with `set:html`; keep those as HTML in the dictionary. Internal links inside a sentence are split into `…Pre`/`…Link`/`…Post` keys so the href can stay locale-aware via `localizePath`.
- **Events — but only events — are translated too, not just the UI strings.** Each
  entry in `content/events/` carries an optional `i18n` block keyed by *dictionary*
  name (`en`/`de`/`hr`/`bs`/`sr` — one per locale) plus `sourceLang`
  and a `sourceHash` of the source text. `localizeEntry(entry, dict)` in
  `src/lib/content.js` swaps the translated fields in at render time and falls back
  field-by-field to the authored text. **Only an event's `title`/`description`
  are translated** — its `location` is a venue name or street address and translating it
  would corrupt directions. The `i18n` block *must* stay listed in the events
  collection's `carry` array in `worker/collections.js`: an editor that commits back
  only the fields it knows about would otherwise strip the translations on every board
  save. `worker/collections.test.js` asserts it is there.
- **Event translation happens in the Worker, as part of the board's save.**
  `worker/translate.js` fills an entry's four languages inside the *same commit*
  as the entry, so one save is one rebuild; `/admin` shows a per-event state
  badge, a Translate button, and the four translations as editable fields, and a
  daily cron sweep in the same Worker fills anything a save missed. It replaced
  `.github/workflows/translate-content.yml`, which needed a repo secret and
  reported its failures only in GitHub's Actions tab — a surface no board member
  has an account for, which is why it failed unnoticed from 2026-07-30 until this
  landed. `scripts/translate-content.mjs` (`npm run translate:content`) is still
  there for a maintainer doing bulk work.
  **Both callers share `src/lib/translate/content.js`** — `TRANSLATABLE`,
  `sourceHash`, `translationState`, `planFor`, `mergeTranslations`, `gate`. Never
  re-derive "does this need translating?" in a caller: two copies do not fail
  loudly, they just re-translate over the board's hand corrections.
  **A hand-corrected translation survives until the English text changes**, and is
  discarded when it does, because it translates a sentence that no longer exists.
  `sourceLang`/`sourceHash` are the Worker's bookkeeping and are never read from
  the form. **A translation failure must never fail a save** — `translateEntry`
  returns statuses instead of throwing, and the entry commits untranslated.
- **`content/members/` is never translated, and has no `i18n` block at all.** A board
  member's name, role and bio render identically on every language's page. Roles are
  used in English at HSG, and a bio is a person describing themselves in their own
  words — machine translation mangles that (it once turned the bio "krastavac" into
  "Küstenfischer" on the German page). `memberSchema` is `.strict()` and declares no
  `i18n`, so reintroducing one fails the build; keep it out of the members collection's
  `carry` array in `worker/collections.js` and out of `TRANSLATABLE` in
  `src/lib/translate/content.js` too (it is `{ events: ["title", "description"] }` —
  one list, shared by the Worker and the CLI). The same goes for partners.
- **`src/lib/translate/` is isomorphic, and that is a hard constraint, not a preference.** `deepl.js`, `validate.js`, `glossary.js` and `flat.js` run in **two** runtimes: Node (the `scripts/` CLIs) and workerd (`/admin`, which translates a board member's save). So no `node:` imports, no `fs`, no `process`, no `console` formatting baked into a return value — `fetch`, `crypto.subtle` and the standard library are the whole budget. Adding `process.env` to one of them keeps `npm test` green and breaks a board member's save instead. The Node-only edge is `scripts/lib/require-api-key.mjs`, which is why it is not in there. `npm test` covers the directory through `src/lib/**/*.test.js`.
- **The UI dictionaries are filled offline, never at build time** (event *content* is the other path — the Worker, on save; see above). `scripts/translate.mjs` (`npm run translate`, gated on `DEEPL_API_KEY` — put it in a gitignored `.env`, copied from `.env.example`; `npm run translate` loads it automatically) reads `en.json` and fills `hr`/`bs`/`sr`. German is excluded by default because it is hand-reviewed and live; pass `de` explicitly to include it. Existing translations survive unless run with `--force`. The build itself stays hermetic; you run this by hand, read the review report, and commit the JSON.
- **DeepL translates one string per request, using its `context` parameter for whatever disambiguates it.** This replaced an offline Claude pipeline (2026-08, board decision, PLAN.md §4) that sent the whole dictionary in one request per language so the model could decide terminology once across all keys — but that depended on `ANTHROPIC_API_KEY`, a metered key billed to a personal account, which the club must not depend on. DeepL's `context` parameter is per-request, not per-string, so `src/lib/translate/deepl.js` calls it once per key: a hand-written note (`NOTES` in `translate.mjs`, or the sibling field in `translate-content.mjs`) for a key that needs one, and — for a key that is part of a `Pre`/`Link`/`Post` split sentence — the sentence joined back together. Context is not translated and does not count toward the character quota, but it cannot pin terminology or address form across a whole dictionary the way the single-request Claude prompt did; `src/lib/translate/validate.js`, unchanged by the swap, is what still catches that.
- **`src/lib/translate/glossary.js` is the translation policy, and every entry is there because its absence shipped a bug.** Protected names (never translated — `Meet & Greet`, `Svadba`, `Déja Vu Bar`, `Prvi Maj`), one pinned term per concept per language, per-language variant rules (Croatian vs Bosnian lexis, Ekavian vs Ijekavian, Latin script for Serbian), morphology (`St. Gallen` declines, `HSG` hyphenates), and the address form. Read `TERMS` as a changelog of what went wrong.
- **Nothing is written until `src/lib/translate/validate.js` passes.** It checks key sets, placeholders, HTML tag structure and hrefs, protected names, forbidden renderings, script, regional variant, glued tokens (`uSt. Gallenu` shipped in two locales) and split-sentence joins. Errors abort the run and leave the files untouched; warnings are reported for a human. It is unit-tested in `npm test` and mutation-checked, because **these defects are invisible to every other command** — `test`, `build`, `check` and `check:dist` all passed for months while the About page described the buddy system as a *mating* system. Add a check here when you find a new failure class; do not fix it only in the JSON.
- **Bosnian, Croatian and Serbian each have their own dictionary.** `bs` and `hr` shared one (`bcs`) until the differences turned out to matter: that file was overwhelmingly Croatian (`sustav`, `sveučilište`, `inozemstvo`, `svibnja`) with stray Bosnian forms mixed in — the same university appeared under two different names in one file — so a Bosnian reader got inconsistent Croatian and the label was the only Bosnian thing about it. Keep the lexis split: `hr` takes `što`/`sveučilište`/`inozemstvo`/`tjedan`, `bs` takes `šta`/`univerzitet`/`inostranstvo`/`sedmica`. The validator enforces it.
- **`complete: false` gates a locale**: its pages are generated (reviewable at real URLs) but marked `noindex`, excluded from the sitemap (`isIndexable` in `astro.config.mjs`) and from `hreflang`, and hidden from the language switcher. Flip to `true` only when that locale's copy is genuinely finished — that one flag publishes it everywhere.

## Roadmap context

**[`PLAN.md`](PLAN.md) is the living status tracker** — the repo map, the open human actions, the remaining roadmap, and improvement ideas. It holds *only work not yet done*. Read it first for orientation. When a task ships, **move its entry to [`PLAN-ARCHIVE.md`](PLAN-ARCHIVE.md)** in the same PR — the archive holds the shipped-PR table, the dated status notes, and the full write-ups of completed decisions (its §1–§7 numbering is preserved because code comments cite "PLAN.md §4" etc.). Do not add a `[x]` item or a history section back to `PLAN.md`.

A phased improvement plan exists at `~/.claude/plans/compare-this-static-website-cryptic-key.md`. The Astro migration was Phase 1. Known deferred work: generated sitemap with hreflang, English + BCS i18n, a partners/recruiting funnel, and CSP/CI hardening. (Done: Phase 1 Astro migration, image optimization, generated sitemap, Zod content schemas, and the `/admin` panel — first Sveltia, now the first-party form + Worker that replaced it.) Check that plan before large structural changes so work aligns with the intended direction.
