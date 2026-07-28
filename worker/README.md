# The admin Worker

This folder is the only server-side code in the project. It backs the admin
panel at [yunited.ch/admin](https://yunited.ch/admin), which the board uses to
add and edit events, board members and partners.

Board-facing instructions live in [`docs/ADMIN.md`](../docs/ADMIN.md) and in the
help panel on the page itself. This file is for whoever maintains the code.

---

## Why this exists (it replaced Sveltia CMS)

`/admin` used to be [Sveltia CMS](https://sveltiacms.app), a third-party
single-page app. It worked, but it meant:

- **every board member needed a GitHub account with write access to this repo**,
  plus a GitHub OAuth app and a second Cloudflare Worker (`sveltia-cms-auth`)
  just to broker the login;
- **`/admin` needed a much looser Content-Security-Policy** — `unsafe-inline`
  styles, `wasm-unsafe-eval`, the GitHub API in `connect-src`, and a font CDN
  that Sveltia changed between patch releases, silently breaking the toolbar
  twice;
- **the form was a second description of the content model.** `config.yml` had
  to be kept in sync with `src/lib/schema.js` by hand, and drift between them
  was invisible until a save failed or a build broke.

That last one was not hypothetical. Sveltia saved an event's photo as
`/images/events/…` — its `public_folder` prepended to the path — while the schema
requires a path relative to `src/` with no leading slash. **Four events were
saved that way and every one of them failed the build**, so the deploy that
should have published them never ran. The board had made the edits, seen them
save successfully, and had no idea the site was not updating.

The replacement is a form we own plus a Worker that commits:

- **access is managed in Cloudflare, not GitHub.** Adding a board member is an
  email in an allow-list — no GitHub account, no repo collaborator, no OAuth app;
- **one token, held server-side**, instead of a personal token per person;
- **the form is generated from the same registry the Worker validates with**, and
  the Worker validates with the actual Zod schemas from `src/lib/schema.js`. What
  `/admin` accepts and what the build accepts are now one rule, not two. A save
  that succeeds is guaranteed to build;
- **`/admin` runs under a CSP as strict as the public site's** — no
  `unsafe-inline` anywhere, nothing loaded from another origin.

---

## How a save travels

```
browser ──POST /admin/api/save──▶ Worker ──GitHub API──▶ one commit on main
                                                              │
                                                Cloudflare rebuilds (~1–2 min)
```

The browser never talks to GitHub and never sees the token. `/admin`'s CSP is
`connect-src 'self'`, so it could not even if the code tried.

Each save is **one commit**, built with the Git Data API (blobs → tree → commit →
ref update) rather than the simpler Contents API. That matters: adding an event
with a photo is two files, and committing them separately would leave a window
where the JSON names an image that is not in the repo yet — which fails the build
outright, because `src/lib/images.js` throws on a missing image. One commit also
means one rebuild instead of two.

The branch is moved without `force`, so GitHub requires a fast-forward. If two
board members save within the same few seconds, the second is told to reload and
retry rather than silently discarding the first one's commit.

---

## The files

| file | what it is |
| --- | --- |
| `index.js` | The routes (`/admin/api/state`, `/save`, `/delete`) and the save/delete logic. Start here. |
| `collections.js` | **The registry** — which fields exist, their labels, help text, and where photos are filed. The panel's form is generated from this, so it is the only place to add or change a field. |
| `github.js` | The GitHub client. Reads the content tree; makes one atomic commit. |
| `access.js` | Reads the Cloudflare Access identity, and optionally verifies its signed token. |
| `lib.js` | Pure helpers: slugs, the academic-year image folder, blank-value coercion. |
| `*.test.js` | `npm test` — the logic no build can check. |

The front end is three plain files in `public/admin/` (`index.html`,
`admin.css`, `admin.js`). No framework, no build step, no dependency to keep
current. They are copied verbatim into `dist/` by Astro.

**Validation is not defined here.** Each collection points at the real schema in
`src/lib/schema.js`; that file remains the authoritative description of the
board's edit surface, exactly as `CLAUDE.md` says.

### Adding or changing a field

1. Change `src/lib/schema.js` — that is what decides validity.
2. Add the matching entry to `fields` in `worker/collections.js` (label, type,
   `required`, `emptyValue`, one line of help text).
3. `npm test`. `collections.test.js` fails if a schema field is unreachable from
   the form, or if the form offers a field the schema would reject.

Nothing in `public/admin/` needs to change — the form is generated.

---

## Deploying

The Worker and the static site are **one Cloudflare Worker**, configured in
[`wrangler.jsonc`](../wrangler.jsonc). `main` points at `worker/index.js`, and
`assets.run_worker_first` routes only `/admin/api/*` to it — every page, image
and stylesheet still goes straight to static assets without invoking any code.

They therefore deploy together. Cloudflare Workers Builds runs `npm run build` on
every push to `main` and deploys the result, so **a merge to `main` deploys the
Worker too**. There is no separate step.

To deploy by hand, or to test a change before merging:

```bash
npm run build          # the Worker needs dist/ to exist
npx wrangler deploy
```

To run it locally:

```bash
npm run build
npm run admin:dev      # wrangler dev — http://localhost:8787/admin
```

Local runs need a **gitignored** `.dev.vars` file in the repo root. All three
lines matter:

```
GITHUB_TOKEN = "github_pat_..."
GITHUB_BRANCH = "some-scratch-branch"
CF_ACCESS_AUD = ""
```

- **`CF_ACCESS_AUD = ""`** switches off token verification locally. There is no
  Access in front of `localhost`, so without this every request 403s. `.dev.vars`
  overrides `wrangler.jsonc`, and the 403 message says as much if you forget.
- **`GITHUB_BRANCH`** — point it at a scratch branch before testing writes.
  `wrangler dev` commits for real, so otherwise your experiments land on `main`
  and deploy to the live site.

To exercise the API by hand:

```bash
curl localhost:8787/admin/api/state
curl -X POST localhost:8787/admin/api/save \
  -F collection=events -F file= -F "title=Test" -F "description=Testing." \
  -F date= -F time= -F location= -F rsvpUrl= \
  -F "image=@src/images/events/25_26/brunch_2026.webp"
```

To watch it in production: `npx wrangler tail`.

---

## Configuration

### `GITHUB_TOKEN` — the one secret

An encrypted Worker secret. It is not in this repo, not in `wrangler.jsonc`, and
must never be.

```bash
npx wrangler secret put GITHUB_TOKEN     # paste at the prompt; it is not echoed
```

It needs **write access to this repository's contents and nothing else**. Create
it at **GitHub → Settings → Developer settings → Personal access tokens →
Fine-grained tokens → Generate new token**:

| field | value |
| --- | --- |
| Resource owner | `alekswithk` |
| Repository access | **Only select repositories** → `alekswithk/yunited` |
| Permissions → Repository → **Contents** | **Read and write** |
| Permissions → Repository → Metadata | Read-only (added automatically) |
| Expiration | your call — see the note below |

Nothing else. Not Actions, not Workflows, not organisation permissions. Contents
is what reads `content/**` and commits back to it; Metadata is a mandatory
dependency GitHub adds by itself.

**Expiration is a real trade-off.** A fine-grained token maxes out at one year,
and when it expires `/admin` stops saving until someone reissues it. GitHub emails
the owner beforehand. Pick a date you will actually notice, and write it in
`PLAN.md` — a board that cannot publish an event the week before it happens is a
worse outcome than a slightly longer-lived token.

Commits made with it are attributed to whoever owns the token, so the commit
message records which board member actually made the change (`Saved from /admin by
name@example.com`) and the trail is not lost.

**Failure modes are explicit, not silent:**

- **not set** → `/admin` lists nothing and says a maintainer needs to run
  `wrangler secret put GITHUB_TOKEN` (503).
- **wrong, expired, or missing the Contents permission** → GitHub rejects it and
  the panel says exactly that, naming the permission to fix (502).

To rotate: issue a new token, run `wrangler secret put GITHUB_TOKEN` again, then
delete the old one on GitHub. The secret is versioned by Cloudflare, so the change
takes effect on the next request — no deploy needed.

### Plain variables in `wrangler.jsonc`

| name | what it does |
| --- | --- |
| `GITHUB_REPO` | `alekswithk/yunited` |
| `GITHUB_BRANCH` | `main` — the branch that gets committed to and deployed |
| `CF_ACCESS_TEAM_DOMAIN` | the Zero Trust team hostname — turns on token verification |
| `CF_ACCESS_AUD` | the `/admin` Access application's Audience (AUD) tag |

Neither `CF_ACCESS_*` value is a secret. The AUD tag appears in the Access login
URL of anyone who visits `/admin`; it names the application, it does not grant
anything. Both belong in `wrangler.jsonc` where they can be reviewed.

---

## Who can get in

**Entirely managed in the Cloudflare dashboard.** There is no login code in this
project and there should never be one.

> **Zero Trust → Access → Applications → the `yunited.ch/admin` app → Policies**

Add or remove a board member's email address there. That is the whole procedure:
**no code change, no deploy, no GitHub account, no repo access.** When someone
leaves the board, removing their email is enough — they lose access immediately,
and they never had a credential of their own to revoke.

The Access application is scoped to the path `yunited.ch/admin`, which covers
`/admin/api/*` too, because Access matches on path prefix. That is why the API
lives under `/admin/` rather than at, say, `/api/admin` — one policy protects
both, with nothing to keep in sync.

### Verifying the Access token — on, and why

`CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` are set, so the Worker verifies the
signed JWT that Access issues on **every** `/admin/api/*` request: it fetches the
team's public keys, checks the signature, the issuer, the audience and the expiry,
and refuses anything that fails. Forging the `Cf-Access-Authenticated-User-Email`
header gets you nowhere; that header is only ever used for the "Signed in as"
line.

This matters because **Access is attached to a hostname, not to a Worker.** The
application fronts `yunited.ch/admin`. The very same Worker was also answering on
`yunited.<subdomain>.workers.dev`, serving the identical site with no Access
anywhere near it — so `/admin/api/save` would have been an unauthenticated
endpoint that commits to this repository, reachable by anyone who guessed the
hostname.

That is closed twice over:

1. **`workers_dev: false` and `preview_urls: false`** in `wrangler.jsonc` remove
   the hostname entirely, so there is no un-fronted route to reach.
2. **Token verification** rejects the request anyway, wherever it arrives from.

Keep both. The first is the door; the second is the lock, and it keeps working if
someone re-enables the hostname, adds a route, or narrows the application's path
scope so it no longer covers `/admin/api/*`.

**Consequence worth knowing:** Workers Builds preview URLs for pull requests are
off, because they are `workers.dev` hostnames and share the same exposure. If you
want them back, set `preview_urls: true` — the token check still protects the API,
but the whole site is then duplicated on a public hostname again.

With the two values unset the Worker logs a warning and skips the check, which is
how it behaved before they were filled in. Don't rely on that.

---

## Things worth knowing before you change something

- **An entry's filename never changes after it is created.** Editing an event's
  title does not rename its file. Nothing user-facing depends on the filename —
  there are no per-event pages — and renaming would break the rule in
  `src/lib/content.js` that an entry carrying an explicit `id` must match its own
  filename.
- **`i18n` is carried through untouched on every save.** It is written by
  `scripts/translate-content.mjs`, never by hand and never by the panel. Dropping
  it would strip every translation — see `carry` in `collections.js`, and the
  test that guards it.
- **Deleting an entry deletes its photo too**, unless another entry uses the same
  file.
- **A photo's folder comes from the event's date**: `src/images/events/26_27/…`
  for the 2026/27 season, which rolls over in August. This mirrors how the repo
  already files them.
- **HEIC uploads are refused at the door**, with an explanation. Sharp cannot
  decode them, so accepting one would fail the build after a successful save.
- **Reads immediately after a write can be stale.** GitHub serves the
  tree-by-branch lookup from a cache for a few seconds. The save and delete
  responses therefore return the updated list directly instead of re-reading —
  don't "simplify" that back into a second fetch.
