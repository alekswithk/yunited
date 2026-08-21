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

_**The live items are not code.** (1) **Automatic translation is switched off.**
The workflow that localizes each `/admin` save requires `ANTHROPIC_API_KEY`,
which is not set and — **as of 2026-08-06 — will not be**: the board does not
want the site to depend on a metered API account belonging to whoever happens to
be president. The replacement is DeepL's free tier; the procedure is §4's
**"Translation runs on DeepL's free tier"** item, and it is now the priority
translation task. Until it lands, a new event saves and publishes in its
authored language with its translations unfilled, and the "Translate content"
run fails on every content push (it last failed on 2026-07-30). (2) The 26/27
calendar is empty — every dated event is in the past,
so Upcoming shows one TBA card; the build warns about it and is warning right
now. (3) ~~The `GITHUB_TOKEN` expires end of August 2026~~ — **replaced
2026-08-06 with a non-expiring fine-grained PAT; no longer a deadline.** All in
§3. New ideas are parked in §4.5.)_

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

| — | **TOC rail moved to the right gutter, sized from the gutter, and made compositing-independent** — the rail had been placed with `left: max(--space-4, (100vw - --max-width)/2 - 140px)`, which clamps to 24px the moment the gutter runs out; that is exactly where the `.container` text edge sits, so **between the 1100px breakpoint and ~1480px the 150px rail was drawn on top of the leftmost content** at `z-index: 20`. Position and width are now both derived from `--toc-gutter`, the whitespace beside the content column, so the rail's inner edge sits a constant `--toc-gap` from the text at every width and its outer edge never reaches the screen edge; it shrinks from 150px to a 6.5rem floor (sized off the longest label) instead of holding one width, and the breakpoint moves to **1400px**, below which the gutter genuinely cannot hold a labelled rail. The gutter is a percentage of `<main>` rather than `100vw`, which excludes a classic scrollbar — the old formula was ~7.5px off on Windows/Linux. Separately, `.page-toc ol` was `position: sticky` with `transform: translateY(-50%)`, so the box sticking was resolved against and the box painted disagreed by half a rail; **sticky resolves on the compositor thread when the layer is accelerated and on the main thread when it is not, so the rail's detach at the bottom of `<main>` differed with hardware acceleration on vs. off**. The transform is gone — the sticky box is now exactly `100vh` with the list flex-centred in it, landing on the same optical centre (`50vh + 3rem`) with the sticky box and the painted box identical. Do not reintroduce `will-change`/`translate3d`/`backface-visibility` here; each force-promotes a layer and brings the divergence back. Also: the full-height column no longer eats clicks (`pointer-events`), and the rail line is mirrored to the outer edge with labels right-aligned |

| — | **The TOC rail was rendered in a browser for the first time, and then put back the way it was** *(follow-up to the row above, which shipped unrendered)*. #55's claims were code comments no command in this repo can check, and one was false: the comments sized the rail around a longest label of `"Buddy-System"` (12ch) when the real longest is `toc.buddy` in hr/bs/sr, **`"Sustav/Sistem prijatelja"` at 17ch**, on the very page that lists it. Measured in Chrome: Space Mono advances **612/1000 em**, so at `0.66rem` with `0.04em` tracking a character is 6.885px and that label is **117.0px**. But the more important finding was behavioural, and it is why the gutter-derived rail was reverted: #55 replaced the short sticky box (`top: calc(50vh + 3rem)` + `translateY(-50%)`, the box being the height of the rail) with a **full `100vh` box centred by flexbox**. Those look identical while the rail is held, and they land on the same optical centre — but a 100vh box **stops sticking a whole viewport earlier**, so for the last stretch of the page the rail rode up and hung clipped under the header showing three of its four entries. So the rail is now **the pre-#55 rail, mirrored to the right**: fixed 150px, the same `max(--space-4, (100vw - --max-width)/2 - 140px)` offset, the same short sticky box, rule on the outer edge with labels right-aligned. Confirmed in Chrome at the bottom of `/hr/about`: rail box back to 119px, held at a constant `top: 439`, easing up 160px at the end with **all four entries visible and clear of the footer**. The one number that had to change is the **breakpoint, 1100px → 1480px**: `max(--space-4, …)` clamps to 24px once the margin runs out, which is exactly where the `.container` text edge sits, so below 1480px the old rail was drawn over the content — on the left before, and it would do the same on the right. Above 1480px this is pixel-identical to the rail that was there; below it, the old one was broken. `--toc-width-max`/`--toc-gap` are gone with the formula that used them. **New rule in `CLAUDE.md`:** layout changes need a browser pass at the widths their breakpoints name, in a long-label locale, and a claim in a code comment is not verification |
| — | **TOC: the highlight follows the reading position, and the rail is the same length on every page** — two faults, both seen in Chrome on `/hr/about` at 2548×1175. (1) The scroll spy was an `IntersectionObserver` on a 10%-tall band pinned 20% down the viewport, and the band **could not be reached at all by a section too close to the end of the document**: the last entry is only reachable while `document height − last section top > (1 − line) × viewport`, so *Vrijednosti* went unlit at every viewport taller than ~1154px and *Priča* stayed highlighted over a screen full of Values — the same on `/`, where *Tko smo mi* needed 2364px of scroll on a page with 2294px of it. It also fired late: 20% down is high enough that the full-width dark `#story` band had filled most of the screen before its entry lit. Now one rAF-throttled scroll pass (merged with the backdrop sync that already ran there, since both need the same rects) picks the last section whose top has crossed a reading line at **0.4 × viewport**, with `atBottom` closing the reachability case outright. Measured: the buddy→story switch lands on the predicted pixel (`buddy` at 1250, `story` at 1262, predicted 1256), and the bottom of both pages now highlights its own last entry. (2) The rail was as tall as its entries, and the two pages don't have the same number of them — four on `/about`, three on `/` — so the centred rails sat 15px out from each other at both ends. `min-height: 120px` on the `<ol>` with the entries sharing it: both pages measure **top 576 / bottom 696** held, **551 / 671** at the foot, and the rail still clears the footer (671 ≤ 747). `min-height`, not `height`, so a label that ever wraps grows the rail instead of overflowing it; nothing wraps today |

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

      **What this means until that lands:** the "Translate content" workflow
      fails on every push to `content/**` (last failure 2026-07-30, run
      `30544840928`), so a `/admin` save publishes in its authored language on
      all five locales with the other four unfilled. The pages still render
      completely — `localizeEntry()` falls back field by field to the source
      text — so this degrades the site rather than breaking it. If a specific
      event must be localized before the migration is done, the manual escape
      hatch still works with any key, from a laptop, without CI:

      ```bash
      ANTHROPIC_API_KEY=… npm run translate:content   # one-off, then commit
      ```

      `DEEPL_API_KEY` **stays** (repo secret + local `.env`) — it is the target
      of the migration, not a leftover. The earlier instruction to delete it is
      withdrawn.

      *Unchanged either way: the site build never calls a translation API and
      stays hermetic; no translation secret belongs in the Cloudflare build
      settings, so a deploy can never depend on a translation API being
      reachable.*
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

- [~] **Translation runs on DeepL's free tier, not a paid Anthropic key**
      *(medium — this is the succession item, and the priority translation
      task).* **IN PROGRESS, 2026-08-17: stages 1/3/4/5 below are done; stage 6
      (a live run with a real `DEEPL_API_KEY`) is the one thing left, and it
      needs a human — see that stage for exactly what to run.** **Board
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

      *Note for the weekly agent (§7): this item touches
      `.github/workflows/**` and dependency files, so it may be implemented but
      **never auto-merged** — open the PR and leave it for a human. Stage 0 must
      be answered before any code is written. **Done, 2026-08-17: stages 1–5
      implemented and verified (see above); stage 6 needs a human with a real
      `DEEPL_API_KEY` and the item stays `[~]` until it runs.** Left the PR
      open per this note, not because CI failed.*

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

- [ ] **Structured data for events (`schema.org/Event` JSON-LD)** *(small–medium).*
      `index.astro` already emits an `Organization` JSON-LD block (`orgSchema`,
      rendered via a data-block `<script type="application/ld+json">`, exempt from
      `script-src` per the CSP convention in `CLAUDE.md`); `/events` and each
      `EventCard` emit none, so an event never has a shot at Google's Event rich
      results or "Things to do" carousel. Add one `Event` JSON-LD block per
      **dated** upcoming event (`name`, `startDate`, `location`, `description`,
      `url`) sourced from the same `events` export `src/lib/content.js` already
      provides — no new content field, no new dependency. TBA-dated events are
      skipped: schema.org requires a `startDate`.

- [ ] **"Add to calendar" (.ics) link on each dated event** *(small).* Every
      upcoming event already has a title, date, time and location in
      `content/events/*.json`; attending means retyping all of that into a
      calendar app by hand. Generate a `data:text/calendar` URI at build time —
      one small, pure, unit-testable function alongside `src/lib/events.js` — and
      render it as a download link on `EventCard`. No backend, no new dependency,
      no content-schema change.

- [ ] **"Skip to main content" link** *(small).* `BaseLayout.astro` has a
      `<main>` landmark but nothing before it lets a keyboard or screen-reader
      user bypass the header and nav — the WCAG 2.4.1 "bypass blocks" check. Add a
      link, visually hidden until focused, as the first element inside `<body>`,
      pointing at an `id` added to `<main>`; style it in `global.css` (no
      `style="…"`, per the CSP rule in `CLAUDE.md`).

- [ ] **RSS feed for events** (`/events.xml`) *(small).* Board and members have
      no way to notice a new or changed event short of checking `/events`.
      `@astrojs/rss` — the official Astro-maintained sibling of the
      `@astrojs/sitemap` integration already in use — can generate a feed
      straight from the same `events` export `src/lib/content.js` provides. One
      new dependency, but Astro-maintained, and no server code: fits the
      build-time-only architecture as-is.

- [ ] **`<link rel="preconnect">` to Formspree on the contact page** *(tiny).*
      `contact.astro`'s form POSTs to `formspree.io`, the one third-party origin
      the site talks to, with no early-connection hint — the DNS/TLS handshake
      only starts once the visitor clicks submit. A one-line `preconnect` shaves
      that off the perceived submit latency; no CSP change needed since the form
      already targets that origin.

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

- [ ] **`npm audit` regressed, and nothing in CI would have said so**
      (found 2026-08-06; **drifted again 2026-08-07**) *(small).* Now **6
      vulnerabilities — 3 high, 3 moderate**, one week after #40 left the tree at
      0. Every one is dev tooling that never reaches a visitor or the deployed
      Worker (`undici`/`miniflare` under `wrangler`, so `npm run admin:dev` only;
      `postcss` under `astro`/`vite`, at build time over CSS authored in this
      repo; `fast-uri` under `@astrojs/check`, so `npm run check` only; and
      **`js-yaml`**, `GHSA-5p4m-2wfm-xmqj`, new on 2026-08-07), which is why this
      sits in §5 rather than §3.

      **It moved 5 → 6 in a single day**, which is the strongest available
      argument for the CI step below: the count changed twice in eight days and
      no command anyone runs said so either time. `js-yaml` has a non-breaking
      fix.

      **The finding is the silence, not the CVEs.** #40 was the PR that
      established dev-dependency CVEs count here — `sharp` processes board
      uploads at build time — and yet `ci.yml` has no `npm audit` step, so a
      week's drift was invisible until someone ran it by hand. Fix: `npm update
      astro wrangler` (7.1.4 → 7.1.6, 4.114.0 → 4.118.0) and `npm audit fix` for
      the non-breaking `fast-uri`/`postcss` fixes, then add a **non-blocking**
      `npm audit --audit-level=high` step to `ci.yml`, and record honestly what
      remains rather than forcing it green.

      **Do not run `npm audit fix --force`** — it "fixes" the wrangler chain by
      *downgrading* wrangler to 4.35.0, which is the advisory range confusing the
      resolver, not a real fix. Verify with all four commands afterwards,
      `check:dist` especially: an Astro bump changing an inlining default is
      precisely the regression that guard exists for. Touches `ci.yml` and
      dependency files, so §7 forbids the weekly agent from auto-merging it.

- [ ] **A red CI run on `main` tells nobody** (found 2026-08-07) *(small).* On
      2026-08-06 GitHub's hosted runners failed to pick up this repo's jobs — the
      run against `5136f53` died with *"the job was not acquired by Runner of type
      hosted even after multiple attempts"* after 15 minutes, and the merges of
      #52 and #53 later that evening produced **no runs at all**. The runners
      recovered on their own and nothing was wrong with the code (all four
      commands were verified green locally on `a822588`). **The gap is that the
      outage was only found by someone going to look.** A failed push-run on
      `main` produces no notification anyone reads, and `ci.yml` has no
      `workflow_dispatch` trigger, so there is not even a one-click way to
      re-validate `main` without pushing a commit.

      Two cheap fixes, either sufficient: add `workflow_dispatch:` to `ci.yml`'s
      `on:` block so `main` can be re-checked on demand, and/or turn on failure
      notifications for the repo's Actions. **This is the same shape as the two
      items either side of it** — the audit that drifted unseen, and the
      empty-calendar warning that only a developer running a build ever reads.
      The repo is good at building assertions and poor at delivering them to a
      person; that pattern, not any one of the three, is the thing worth fixing.
      Touches `.github/workflows/**`, so §7 forbids the weekly agent from
      auto-merging it.

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
