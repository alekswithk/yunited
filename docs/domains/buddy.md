# Domain: buddy / kumstvo system

The programme that pairs a new HSG or exchange student with an existing YUnited
member. Sign-up → email verification → the board runs a matching round → each pair
gets a private page. It is the **only** part of the project that keeps data outside
Git — per-student signups live in **Cloudflare D1**, reached only through the Worker.

Landed on `main` via #75–#77 (2026-08-29). Inert in production until two out-of-band
steps are done — see *Open items*.

---

## What this domain owns

| Path | Role |
|---|---|
| `src/lib/buddy/match.js` | `planMatches()` — the pairing rule. Pure, seeded, framework-free. |
| `src/lib/buddy/schema.js` | `signupSchema` (Zod) + `normalizeSignup()` — one definition of a valid signup. |
| `src/lib/buddy/tokens.js` | `randomToken()` / `isToken()` / `timingSafeEqual()` — the URL capability tokens. |
| `src/lib/buddy/emails.js` | the 3 localised emails (`verify` / `matched` / `noMatch`) + `sendEmail()` (Resend). |
| `src/lib/buddy/*.test.js` | `node:test` — match, schema, tokens. |
| `worker/buddy.js` | `handleBuddyPublic` (`/buddy/api/*`), `handleBuddyAdmin` (`/admin/api/buddy/*`), `purgeStaleBuddySignups`. |
| `worker/buddy-store.js` | `buddyStore(db)` — **every** D1 query, behind named methods. Untested I/O layer. |
| `worker/buddy.test.js` | handlers driven against an in-memory fake store. |
| `worker/migrations/0001_buddy.sql` | tables `signups`, `rounds`, `pairs`. |
| `src/pages/[...locale]/buddy.astro` | the `/buddy` page: explanation + sign-up form. |
| `src/pages/[...locale]/buddy/{check-email,confirmed,pair,removed}.astro` | the flow's landing pages. |
| `src/i18n/*.json` → `buddy.*` keys | page copy (all 5 locales; hr/bs/sr on *kumstvo*). |
| `wrangler.jsonc` | `d1_databases` (BUDDY_DB), `run_worker_first: /buddy/api/*`, the nightly cron. |
| `worker/index.js` | wiring: public route (~L84), admin dispatch + `BUDDY_DB` guard (~L323), `scheduled` sweep (~L178). |
| `worker/README.md` → "The buddy system" | the maintainer recipe (setup, env, cron). |
| `docs/ADMIN.md` | board-facing usage of the Buddy tab. |

Admin panel markup for the Buddy tab is in `public/admin/{index.html,admin.js,admin.css}`
(shared with the rest of `/admin` — see the `admin` domain notes if they exist).

---

## How it fits together

1. **Sign up.** Student submits the form on `/buddy` → `POST /buddy/api/signup`
   (**no Cloudflare Access** in front). Honeypot field `website`; `parseSignup`
   against `schema.js`; dedup by email (`store.findActiveByEmail`); a row is
   written `status='pending'`, `email_verified=0`; a `verify` email goes out via
   Resend. Redirects to `/buddy/check-email`.
2. **Verify.** `GET /buddy/api/verify?token=<verify_token>` → `store.markVerified`
   → `status='active'` → `/buddy/confirmed`. The verify token is cleared on use.
3. **Round (board, behind Access), from the `/admin` Buddy tab:**
   `POST round/preview` (runs `planMatches` with a fresh seed, returns a
   human-readable plan) → `POST round/commit` (stores the round + its seed + the
   pairs, marks everyone `matched`) → `POST round/notify` (**idempotent** via
   `rounds.notified_at`; sends `matched` to both sides of each pair and `noMatch`
   to every still-unmatched verified seeker).
4. **Pair page.** `/buddy/pair?t=<token>` → `GET /buddy/api/pair?t=` returns the
   partner's contact details + a checklist. `POST /buddy/api/pair/confirm` and
   `POST /buddy/api/pair/flag` (flag marks the pair and emails the board).
5. **Withdraw.** `GET /buddy/api/withdraw?token=<manage_token>` → `status='withdrawn'`
   → `/buddy/removed`. The manage token is stable and sits in every email's
   unsubscribe line.
6. **Retention sweep.** Nightly cron (`worker/index.js` `scheduled` →
   `purgeStaleBuddySignups`) deletes `status='pending'` rows older than 14 days.
7. **Export.** `GET /admin/api/buddy/export.csv` — the full signup list for the board.

---

## Invariants — do not break these

1. **`src/lib/buddy/` is isomorphic.** It runs in workerd (the Worker) *and* in
   Node (`npm test`). No `node:` imports, no `fs`, no `process`. Budget is
   `fetch`, `crypto` (`getRandomValues` / `randomUUID` / `subtle`), `btoa`, and
   the standard library. Same hard rule as `src/lib/translate/`.
2. **`worker/buddy.js` handlers take injected `store` / `send` / `now` / `origin`**
   (from `ctx`/`deps`). That is what makes them testable against the fake store.
   Never call `buddyStore(env.BUDDY_DB)` or `new Date()` inline in a handler.
   New handler ⇒ new fake-store method in `buddy.test.js` ⇒ a test.
3. **`worker/buddy-store.js` is the only file that touches D1.** Every query is a
   named method with `?1`-style positional binds. A new query goes here, behind a
   method — never inline SQL in `buddy.js`.
4. **Matching is a pure seeded function.** `planMatches({buddies, seekers, seed})`.
   The round persists its `seed` so the exact pairing replays. No real randomness,
   no DB reads inside it. Rule order is **fill** (everyone to one buddy, never past
   a buddy's `capacity`) → **overflow** (only onto buddies with `openToExtra`) →
   **hold the remainder** (returned for the next round, never force-fitted).
5. **Tokens are the whole credential.** `/buddy/api/*` has no Access. `randomToken()`
   is 24 random bytes (~192 bits, base64url), stored next to its row, looked up by
   value. `isToken()` shape-checks before any DB hit. Never make a token a
   derived/signed value; never log one.
6. **A mail failure never fails a signup or a round.** `sendEmail` returns a
   status object, never throws. With no `RESEND_API_KEY` it returns
   `{ok:false, skipped:true}` and the board confirms people by hand from the tab.
   Handlers check `result.ok` / `result.skipped` and carry on regardless.
7. **`round/notify` is idempotent** — guarded by `rounds.notified_at`. A
   double-click or a stale button must never re-send.
8. **The honeypot answers as if it worked.** `raw.website` non-empty ⇒ return the
   normal success redirect, write nothing, never hint it was caught.
9. **The Buddy tab and admin routes are gated on `env.BUDDY_DB`.** No binding ⇒
   tab hidden, `/admin/api/buddy/*` returns an explicit error naming the setup
   step (`worker/index.js`). The **public** `/buddy/api/*` route currently relies
   on its outer `try/catch` (a generic 500) when `BUDDY_DB` is unbound — see
   *Open items*.
10. **`buddy.*` i18n stays complete in all five dictionaries**, and hr/bs/sr say
    *kumstvo*, never "sustav/sistem prijatelja" (matches `glossary.js`
    `TERMS.buddySystem`). `buddy.heroScript` is intentionally identical across
    locales — it is the trilingual flourish "Kumstvo · Кумство · Buddy system".
11. **Email copy lives in `src/lib/buddy/emails.js`**, not the page dictionaries —
    deliberately (email-specific phrasing; a self-contained table reviews better
    than a diff against `src/i18n/`). English is the fallback for any gap.
12. **The `/buddy` pages obey the site CSP** (no inline `style=`, no inline
    `<script>`) and the "browser pass at the breakpoints" rule — `/buddy/pair`
    especially, since students open it on a phone from an email link.
13. **Turnstile protects `POST /buddy/api/signup` against bot abuse.** The check
    runs only when `env.TURNSTILE_SECRET_KEY` is set (skipped without it — a
    known fallback, not a silent failure). `verifyTurnstile` is injected via
    `deps` so tests can mock it. The site key (`PUBLIC_TURNSTILE_SITE_KEY`) is
    a build-time env var (public; the real production key
    `0x4AAAAAAEiJ4FmgBclbap5B` is baked into `buddy.astro` as the default, so a
    missing/misplaced Cloudflare build var no longer silently ships the test key
    — set `PUBLIC_TURNSTILE_SITE_KEY` only to override, e.g. the test key
    `1x00000000000000000000AA` for local dev). The secret is provisioned
    out-of-band — see
    `worker/README.md` → "The buddy system" → "One-time setup".

---

## How to verify a change here

- `npm test` — `src/lib/buddy/*.test.js` + `worker/buddy.test.js` (201 total as of
  2026-08-29). A schema/handler change must land with its test.
- `npm run build` (the `/buddy` route tree must render — 66 pages total) ·
  `npm run check` 0/0/0 · `npm run check:dist`.
- **Adding a signup field:** update `signupSchema` *and* `normalizeSignup`
  (`schema.js`), add the column to `0001_buddy.sql` (or a new migration), add the
  field to the form in `buddy.astro`, and add it to `publicRow` / the CSV header
  in `buddy.js` if the board should see it. New `schema.test.js` case.
- **Local D1:** `npx wrangler d1 migrations apply yunited-buddy` (no `--remote`)
  gives a throwaway local SQLite copy; `npm run admin:dev` serves `/admin` + the
  Worker on `:8787`.
- A true end-to-end check needs the two out-of-band steps (below) done.

---

## Open items & known gaps

- **Go-live (maintainer, out-of-band):** `npx wrangler d1 migrations apply
  yunited-buddy --remote` (verify it ran), then `npx wrangler secret put
  RESEND_API_KEY` + the Resend SPF/DKIM records for `yunited.ch`. D1 is already
  created and bound (`wrangler.jsonc` has a real `database_id`).
- **`worker/buddy-store.js` has no tests** (by design — thin I/O layer, like
  `github.js`). Worth an injected-D1-stub test; see `PLAN.md` §4.
- **`/buddy/pair` and `/admin` have never been rendered at the 33rem phone width.**
- **Round cadence** and the optional **UniClubs member-list CSV cross-check** are
  board decisions, not code.
- Public `/buddy/api/*` with `BUDDY_DB` unbound falls to a generic 500 rather than
  a setup-step message (the admin route handles that case explicitly).

---

## Pointers

- `worker/README.md` → "The buddy system" — the maintainer setup recipe.
- `worker/README.md` → "The buddy system" → "One-time setup" — includes Turnstile setup (step 3).
- `docs/ADMIN.md` — board-facing usage.
- `PLAN.md` §2 (go-live) and §4 (store tests).
- `CLAUDE.md` — the cross-cutting rules (CSP, isomorphic constraint, browser pass).
