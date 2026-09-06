---
name: verify-yunited
description: "Render YUnited's pages in a real browser and prove layout, sticky/stacking, and scroll/expand motion behave. This is the gap the four CI commands (npm test, build, check, check:dist) cannot see. Use before finishing any change to src/styles/global.css, a layout or component .astro file, astro.config.mjs, or motion, and when a layout or animation bug is reported. Drives Playwright against a local preview at the breakpoint widths and long-label locales (hr/bs) the code names."
---

# Verify YUnited rendering

`npm test`, `npm run build`, `npm run check` and `npm run check:dist` never open a page. Overlap, wrapping, sticky and stacking behaviour, scroll-driven animation, and the `<details>` open/close transitions on the home posters are invisible to all four. This skill is the scripted browser pass `CLAUDE.md` mandates but nothing enforces.

It does **not** replace the four commands. "Verified" for a layout or motion change means all four are green **and** a clean run of this skill at the widths and locales below.

## When to run

Run it when the diff touches:

- `src/styles/global.css` (any rule)
- a layout or structural component: `src/layouts/BaseLayout.astro`, `src/components/UpcomingEvent.astro`, `EventCard`, `MemberLead`/`MemberRow`, `Portrait`, the `/about`, `/buddy`, home or `/events` pages
- `astro.config.mjs` (asset inlining, build format) or `public/_headers` (the `frame-src` token for the OSM iframe is only verified in a browser)
- anything described as motion, animation, sticky, TOC, poster, card, hero, or "the strip"

Also run it when a visual or animation bug is reported, before proposing a fix and again after.

Skip it for pure content edits (`content/**/*.json`), pure logic (`src/lib` non-CSS), translation strings, or Worker code with no rendered surface. Those are covered by `npm test` + `npm run build`.

## The hidden-tab trap

The `claude-in-chrome` automation tab runs with `document.visibilityState === "hidden"`. That **freezes CSS transitions** and throttles `requestAnimationFrame`, and its screenshots are unreliable. Driving `getAnimations()[i].currentTime` by hand advances the clock **without re-resolving layout**, so it masks exactly the bugs the home posters keep having (`min-width: auto` floors, content-height floors, the end-of-open height jump).

So: use **Playwright** for anything involving motion or an open/close transition. It drives a real, non-throttled Chromium. Static end-states (toggle `[open]` with transitions killed) can be read either way, but never trust `claude-in-chrome` for playback, and never scrub animation clocks for the `.uev` checks — sample real elapsed time.

## Launch

```
npm run build && npm run preview      # serves dist/ at http://localhost:4321
```

`npm run preview` is `astro preview`. Ready when the port answers (`curl -sI localhost:4321` → `200`). Use `preview`, not `dev`: only the built output has the real CSP headers and the hashed `/_astro/` assets, and CSP violations (the OSM iframe) only show against the built page.

Run the preview in the background and keep its PID. Tear it down in Cleanup by that PID.

## Doctor

Before driving, confirm the instance is worth driving:

- `curl -sI localhost:4321` returns `200`
- a known marker is in the build: `grep -q "Meet & Greet" dist/events.html`
- `dist/` is newer than your last edit under `src/` (else rebuild)

## Drive

Prefer the Playwright MCP (`mcp__playwright__browser_navigate`, `browser_resize`, `browser_evaluate`, `browser_take_screenshot`, `browser_console_messages`). It bundles its own Chromium, so this skill needs no repo dependency.

- Set the viewport with `browser_resize` **before** navigating.
- For a locale, navigate to the prefixed URL: `/about` → `/hr/about`, `/bs/about`, `/de/about`. English has no prefix. All five locales are `complete: true`.
- Read invariants with `browser_evaluate` returning JSON (bounding rects, computed styles, `scrollWidth`/`clientWidth`). Keep raw payloads in the tool call; return only pass/fail and the offending numbers.
- For reduced motion, drive with Playwright's `emulateMedia({ reducedMotion: 'reduce' })`. If the MCP does not expose it, say so and note the reduced-motion checks were not run rather than faking them with a `matchMedia` shim.
- For the `.uev` open/close, click the real control and sample `.uev[open]` geometry at ~3 real elapsed times across the ~0.28s transition. Do not set `currentTime`.

## Feature map

Each fragile surface, its breakpoints, its locales, and the named invariants. A run checks every one.

### 1. `/about` — the TOC right rail

`src/styles/global.css`, `@media (min-width: 1480px) and (scripting: enabled)`, `--toc-width`. The rail only exists at ≥1480px.

- **Locales:** `/about` (en, "Buddy system", 12ch) and `/hr/about` (hr, "Sustav/Sistem prijatelja", 17ch), plus `/bs/about`. The hr run is the one that matters — PR #55 shipped a `--toc-width` comment asserting a shorter longest label that was never rendered.
- **Widths:** 1479 (rail absent), 1480, 1500, 1700.
- **Invariants:**
  - At ≥1480: the rail is present; each TOC link's text is not clipped (`link.scrollWidth <= link.clientWidth`, or it wraps to full height with no `overflow` clip); the rail's box does not intersect `.prose-column`'s box; the rail is `position: sticky` and stays in the viewport while the article scrolls; the scroll-spy marks the section in view.
  - At 1479: no rail, no empty gutter, no leftover overflow.
  - Every width: `document.documentElement.scrollWidth <= window.innerWidth` (no horizontal page scroll).

### 2. Home `/` — the expanding-event posters

`.uev*` in `global.css`, `src/components/UpcomingEvent.astro`. Fixed for a snap/jump bug five-plus times (PRs #93 → #94 → #97 → #100 → `fix/poster-open-endjump`). Root cause of the last one: `.uev-row` is `align-items: stretch`, so a narrow open sibling's wrapped-title height propagates to the open poster in one discrete step at the end of the open.

- **Locales:** `/`, `/hr/`, `/de/`.
- **Widths:** 375, 528, 640, 760, 900, 1132.
- **Cases:** single upcoming event (`.uev-row > .uev:only-child`) and a 2–3-poster row. If only one event is live in `content/events/`, the multi-poster case needs 2–3 future-dated events added temporarily (or as a fixture) — note it if you cannot exercise it.
- **Static invariants** (transitions killed, toggle `[open]`):
  - Opening `nth-child(2)` in a 3-poster row changes the row height by < 8px between "just opened" and "settled".
  - Opening a sibling does not change poster 1's (`nth-child(1)`) open height — a hard constraint from the board.
  - No poster overflows `.uev-row` / the 1180px container.
  - The open panel's description, address, map placeholder and links are present and not clipped.
- **Motion invariants** (Playwright, real playback, `reducedMotion: no-preference`):
  - Open: sample `.uev[open]` height at ~3 real elapsed times. It moves smoothly, no discrete jump > 8px, and **no jump on the final frame**.
  - Close: same sampling. No end-of-close snap (> 8px in width or height) before it reaches the closed box.
  - Run this at 640 and 900, for `:only-child` and a 3-poster row.
- **Reduced motion** (`reducedMotion: reduce`): open/close is effectively instant; the final open and closed states match the animated ones; no layout thrash.
- **The kilim / folk-motif strip:** it has a running scroll-driven animation (`getComputedStyle(el).animationTimeline` names `view()`, or `el.getAnimations()` is non-empty) and its transform changes as the page scrolls — in every motion state and both `prefers-reduced-motion` values. The board's hard constraint is that it always drifts.
- **OSM map iframe:** on open, the `<iframe>` `src` is set (deferred ~320ms) to a `www.openstreetmap.org` URL, and `browser_console_messages` shows no `frame-src` CSP violation.

### 3. `/buddy/pair` — phone widths

`.buddy-pair-grid` collapses at `@media (max-width: 640px)`; `docs/domains/buddy.md` flags 33rem specifically. Had blank-render bugs (#76, #77).

- **Getting a drivable page:** a bare `/buddy/pair` renders a "no / invalid pair" state. A populated pair page needs a real signup id or D1 state. If the path to one is not obvious from `worker/buddy*.js` or a query param, ask the maintainer — do not guess. Verify the "no pair" state renders cleanly too.
- **Widths:** 375, 390, 528 (33rem), 640.
- **Invariants:** `.buddy-pair-grid` is a single column at ≤640; no horizontal page scroll; the checklist and prompt text wraps and never clips; every interactive control (and, on the admin pair view, the "Send emails" button) is present and tap-sized; images load (`img.complete && img.naturalWidth > 0`).

### 4. `/events` — the magazine grid (lighter check)

`@media (min-width: 901px)` switches column count.

- **Widths:** 900, 901, 1132.
- **Invariants:** the column count changes at the boundary without a card stretching over dead space or sitting alone in a row; card photos settle from the `photo-settle` over-scale without clipping. `.card` / `.card-image` must stay `overflow: clip`, never `hidden` — `hidden` makes the box a scroll container and freezes the photo's `view()` timeline.

## Generic sweep (every run, cheap)

For `{/, /events, /about, /buddy}` × `{en, hr}` × `{375, 768, 1280, 1500}`:

- no horizontal page scroll (`documentElement.scrollWidth <= innerWidth`)
- no element's right edge past `innerWidth + 1`
- no text clipped by an `overflow: hidden`/`clip` ancestor whose `scrollWidth > clientWidth`
- no element still at `opacity: 0` after load with no running animation (the scroll-animation fallback-stranding bug the `@supports (animation-timeline: view())` guard exists to prevent)
- every `<img>` is `complete && naturalWidth > 0`

## Evidence

- For each failure: a screenshot at the failing width/locale, one passing screenshot at a baseline width, and the JSON of the broken invariant (selector, the two numbers, which check).
- Proof standard: exercise the real user path (click the poster, scroll the article). Capture the action and the resulting geometry, not just a final screenshot — a screenshot cannot show a 6px end-of-open jump; the sampled heights can.
- Save evidence in the job scratchpad, not the repo. Attach it to the PR comment only when a reviewer needs it.

## Outcome

Report exactly one:

- **clean** — every listed invariant held at every width and locale.
- **regressed** — name the page, width, locale, invariant, and the numbers.
- **blocked** — could not build, serve, or drive, or `/buddy/pair` needs pair state you do not have. Say which.

## Cleanup

Kill the preview server you started, by its PID. Never `pkill -f astro` — it may kill the user's own `npm run dev`. Leave the evidence files.

## Graduation (later — PLAN.md §4)

Once this has caught a real regression or two and the invariants are stable, promote the geometric checks into a committed `scripts/visual-check.mjs`: add `playwright` as a devDependency, boot `npm run preview`, run the same assertions headless, and report a **non-blocking** warning artifact on the PR. Assert geometry, not pixels — cross-machine font anti-aliasing makes pixel diffs against checked-in baselines noisy, which is why PLAN.md §4 says non-blocking at first. That change touches `package.json` and `.github/workflows/`, so it is its own human-reviewed PR, not something this skill does mid-task.
