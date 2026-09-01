# Domain: translation / i18n pipeline

Two things get translated, by different paths:

1. **The UI dictionaries** (`src/i18n/{de,hr,bs,sr}.json`) — filled **offline** by a
   maintainer running `npm run translate`. Never at build time.
2. **Event `title` / `description` only** (`content/events/*.json` `i18n` blocks) —
   filled by the **Worker on save**, in the same commit, with a nightly cron sweep
   behind it. `npm run translate:content` is the CLI equivalent for bulk work.

**Members and partners are never translated.** An event's `location` is never
translated. The engine is **DeepL free tier** (`:fx` key). The build stays
hermetic — no translation API call ever happens during `npm run build`.

---

## What this domain owns

| Path | Role |
|---|---|
| `src/lib/translate/content.js` | **The one answer to "does this need translating?"** — `TRANSLATABLE`, `TARGETS`, `sourceHash`, `translationState`, `planFor`, `mergeTranslations`, `gate`. |
| `src/lib/translate/deepl.js` | DeepL plumbing — one request per string + `context`; `protect`/`unprotect` (`<x>` brand wrapper); `postProcess` (entity decode, unquote, `ß`→`ss`, `toSerbianLatin`, `pinCanonical`); free/pro endpoint by `:fx`; `usage()` liveness probe; `detectSourceLang`. |
| `src/lib/translate/validate.js` | **The write gate** — `checkString` / `checkDictionary` / `checkSplitSentences` / `errorsOf`. Nothing is written until it passes at 0 errors. |
| `src/lib/translate/glossary.js` | **The policy** — `LANGUAGES` (variant rules), `PROTECTED` (never-translate names), `TERMS` (one pinned rendering per concept per language + `forbidden` + optional `rewrite`), `MORPHOLOGY`, `ADDRESS_FORM`, `CYRILLIC_RE`, `VARIANT_FORMS`, `FORBIDDEN_VARIANTS`. Read `TERMS` as a changelog of shipped bugs. |
| `src/lib/translate/flat.js` | `flatten` / `unflatten` / `splitSentenceGroups` (Pre/Link/Post). |
| `src/lib/translate/*.test.js` | `node:test` — validate (mutation-checked), golden `sourceHash` vs the committed files, deepl pure functions. |
| `worker/translate.js` | **Worker-only** — `resolveKey` (KV over secret), `keyStatus`/`putKey`/`clearKey` (Translations tab), `translateEntry` (never throws; `SAVE_BUDGET_MS = 8000`), `withTranslationState`/`stateOf` (badges). |
| `scripts/translate.mjs` | `npm run translate` — the UI dictionaries. `DEFAULT_TARGETS = ["hr","bs","sr"]`; `NOTES` per-key context. |
| `scripts/translate-content.mjs` | `npm run translate:content` — event content, for a maintainer's bulk runs. |
| `scripts/lib/require-api-key.mjs` | the **one** Node-only edge — reads `DEEPL_API_KEY` from the environment. Kept out of `src/lib/translate/`. |
| `src/i18n/{en,de,hr,bs,sr}.json` | the dictionaries. `en.json` is the source of truth. |
| `src/i18n/config.js` | locale registry — the only place locales are defined (`complete`, `htmlLang`, `dateLocale`). |
| `worker/index.js` | wiring: translate-on-save (~L763), "Translate now" `postTranslate` (~L899), nightly `sweep` (~L196), key endpoints (~L461). |
| `worker/collections.js` | the events collection's `carry` array must list `i18n` (`collections.test.js` asserts it). |
| `wrangler.jsonc` | the cron `17 4 * * *` and the `ADMIN_SETTINGS` KV (holds the board-set `deepl.apiKey`). |

---

## How it fits together

- **`content.js` is the shared brain.** Both the Worker (`translateEntry`) and the
  CLI ask it, never decide themselves. `translationState` returns
  `none` / `missing` / `stale` / `partial` / `translated` — completeness is
  measured over `TARGETS` (not `DICTS`, which includes `en`, which nothing can
  fill). `planFor` turns that into a list of target languages to request (empty =
  do nothing = the quota guard). `mergeTranslations` combines three inputs in a
  fixed precedence: `existing` < `machine` < `submitted` — **but `submitted` and
  `existing` only win while `existing.sourceHash === currentHash`**; when the
  English text changed, both are dropped (they translate a sentence that no longer
  exists) and the board is told in the save banner.
- **`deepl.js` sends one request per string** because `context` is a single
  per-request value, not indexed per text. `context` is disambiguating text (a
  `NOTES` entry, or a split sentence joined back together) — never an instruction;
  DeepL cannot be told a rule. It is not translated and not billed. `postProcess`
  then runs `pinCanonical`, which applies any `rewrite` rule a `glossary.js` TERM
  carries — currently just `board`, collapsing DeepL's reliable "upravni odbor"
  to the pinned "odbor" before the gate. Not a second policy; the gate still
  catches whatever a rule misses.
- **`validate.js` runs on the output**, so it is engine-agnostic. Checks: key
  sets, placeholders, HTML tag structure + hrefs, protected names, forbidden
  renderings, script (no Cyrillic on `sr`), regional variant (hr vs bs lexis;
  Ekavian/Ijekavian), glued tokens (`uSt. Gallenu`), split-sentence joins.
- **`worker/translate.js`** resolves the key (board-set KV `deepl.apiKey` wins
  over the `DEEPL_API_KEY` secret), verifies a pasted key with `usage()` before
  storing it, logs the acting board member, and runs `translateEntry` with an
  8-second budget so a slow DeepL never hangs a save.

---

## Invariants — do not break these

1. **`src/lib/translate/` is isomorphic. Hard constraint.** It runs in Node
   (`scripts/`) and in workerd (`/admin`). No `node:` imports, no `fs`, no
   `process`, no `console` formatting baked into a return value. Budget: `fetch`,
   `crypto.subtle`, the standard library. Adding `process.env` to one of these
   files keeps `npm test` green and breaks a board member's save. The Node-only
   edge is `scripts/lib/require-api-key.mjs` — keep it there.
2. **One answer to "does this need translating?"** — `content.js`. Never re-derive
   it in a caller. Two copies don't fail loudly; they re-translate over the
   board's hand corrections.
3. **A hand-corrected translation survives until the English text changes.** A
   `sourceHash` mismatch discards it. `--force` bypasses that gate — keep forced
   runs on a branch, never on `main` (a forced run on `main` silently overwrites
   exactly the corrections the board is asked to make by hand).
4. **Nothing is written until `validate.js` passes at 0 errors.** Warnings are for
   a human. When you find a new failure class, add a check *here* — do not fix it
   only in the JSON. These defects are invisible to `test` / `build` / `check` /
   `check:dist` (the About page described a *mating* system for months while all
   four passed).
5. **A translation failure must never fail a save.** `translateEntry` returns
   statuses, never throws; the entry commits untranslated with a reason.
6. **`en.json` is the source of truth.** Add every new UI string there first;
   other locales fall back to English so an unfinished locale still renders a
   complete page. Strings with inline markup stay as HTML (rendered `set:html`).
   Internal links inside a sentence split into `…Pre` / `…Link` / `…Post` keys so
   the href stays locale-aware via `localizePath`.
7. **Only events, only `title` + `description`.** Not `location`. Not members, not
   partners (`.strict()` schemas with no `i18n` — reintroducing one fails the
   build). `TRANSLATABLE` is one list shared by the Worker and the CLI.
8. **hr / bs / sr are three separate dictionaries** with a deliberate lexis split
   — `hr`: što / sveučilište / inozemstvo / tjedan; `bs`: šta / univerzitet /
   inostranstvo / sedmica. `validate.js` enforces it. **Serbian is Latin only** —
   `toSerbianLatin` runs in the pipeline and `check:dist` asserts no Cyrillic on
   `sr` pages.
9. **German is hand-reviewed.** Excluded from `DEFAULT_TARGETS`; pass `de`
   explicitly to include it. `ß` → `ss` (this is a Swiss club).
10. **The build stays hermetic.** `npm run build` never calls a translation API.
    No translation secret belongs in the Cloudflare build settings.
11. **The `i18n` block must survive every board save** — it is in the events
    collection's `carry` array in `worker/collections.js` (`collections.test.js`
    asserts it). A Git-based editor writing back only known fields would strip
    every translation otherwise.
12. **`sourceHash` must stay byte-identical** to the Node `createHash("sha256")`
    that wrote every committed hash: each field `TextEncoder`-encoded and
    concatenated (not string-joined), hex, first 16 chars. `content.test.js` has a
    golden test against the committed files.
13. **`protect` / `PROTECTED` is one list, shared with `validate.js` via
    `glossary.js`.** A term protected in `deepl.js` but not checked in
    `validate.js` is how "YUnited" quietly becomes "Vereinigt" in event
    descriptions only.

---

## How to verify a change here

- `npm test` — `src/lib/translate/*.test.js` (validate is mutation-checked; the
  golden `sourceHash` test; deepl pure functions) + `worker/translate.test.js`
  (never-throws, Cyrillic rejection, timeout, hand-edit merge).
- **Never test against the network** — `fetchImpl` is injectable everywhere.
- Dictionary or content change: `npm run build` + `npm run check:dist` (asserts no
  Cyrillic on `sr`, brand spelling `YUnited`).
- **Filling UI keys:** `npm run translate` (needs `DEEPL_API_KEY` in a gitignored
  `.env`; `-- --dry-run` writes nothing and needs no key; `-- de` includes German;
  `-- --force` re-translates everything). Read the review report, commit the JSON.
- `checkDictionary()` can be run directly against the real `hr`/`bs`/`sr`
  dictionaries (not just fixtures) — that is how #73's *kumstvo* change was
  verified.
- **Adding a translatable field or collection:** change `schema.js`, add it to
  `TRANSLATABLE` in `content.js`, add it to `carry` in `worker/collections.js`,
  run `npm test`.

---

## Open items & known gaps

- **7 UI keys unfilled in de/hr/bs/sr** — `skipLink`,
  `events.emptyUpcomingEyebrow/Heading/Body/Instagram/Uniclubs`,
  `events.addToCalendar` — currently rendering in English. `npm run translate`
  fills them.
- **`validate.js` `forbidden` stems are not scoped per language.** German's
  accepted loanword "Buddy-System" trips the `buddy-` rule written for hr/bs/sr
  (~13 false positives when the gate is run against `de.json`). Real finding
  alongside it: `movie-night-svadba-2026.json`'s German title translated the
  protected name `Svadba`.
- **No CI surfacing** of keys identical to English in a `complete: true` locale —
  the 7-key debt above stays invisible between PRs. See `PLAN.md` §4.
- **DeepL glossaries exist only for `de`** among the four targets. hr/bs/sr
  terminology pinning is `context` + the validator, plus per-TERM `rewrite`
  rules in `glossary.js` (`pinCanonical` in `deepl.js`) for regressions
  unambiguous enough to repair before the gate — so far only `board`
  ("upravni odbor" → "odbor").

---

## Pointers

- `CLAUDE.md` → the i18n section — the authoritative narrative (isomorphic rule,
  glossary policy, the bs/hr split, `complete:` gating).
- `PLAN-ARCHIVE.md` §4 — the full DeepL-migration write-up and its reasoning.
- `src/lib/translate/glossary.js` `TERMS` — every entry is a bug that shipped.
