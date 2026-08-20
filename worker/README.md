# The admin Worker

This folder is the only server-side code in the project. It backs the admin
panel at [yunited.ch/admin](https://yunited.ch/admin), which the board uses to
add and edit events, board members and partners — and to manage the list of
people who can open the panel at all.

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

The one route that does not end in a commit is the access list:

```
browser ──POST /admin/api/access──▶ Worker ──Cloudflare API──▶ the rule group
                                                                    │
                                                        in effect within seconds
```

No commit, no rebuild — and no content, either. See **Who can get in** below.

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
| `index.js` | The routes (`/admin/api/state`, `/save`, `/delete`, `/access`) and the save/delete logic. Start here. |
| `collections.js` | **The registry** — which fields exist, their labels, help text, and where photos are filed. The panel's form is generated from this, so it is the only place to add or change a field. |
| `github.js` | The GitHub client. Reads the content tree; makes one atomic commit. |
| `access.js` | Reads the Cloudflare Access identity, and optionally verifies its signed token. |
| `board-access.js` | The Cloudflare client for the **email allow-list** — who may open `/admin` at all. Read it before touching anything about access. |
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

To work on the **Access tab** as well, add the Cloudflare values:

```
CF_API_TOKEN = "..."
CF_ACCESS_GROUP_ID = "<a THROWAWAY group's UUID>"
```

The same warning as `GITHUB_BRANCH` applies, and harder: `wrangler dev` writes to
the real Cloudflare account. Make a second rule group to experiment on, and leave
the one the `/admin` policy actually uses alone — an accidental `PUT` there locks
the board out of the live panel. Leave both unset and the tab simply does not
appear, which is also the right way to check that path.

To exercise the API by hand:

```bash
curl localhost:8787/admin/api/state
curl -X POST localhost:8787/admin/api/save \
  -F collection=events -F file= -F "title=Test" -F "description=Testing." \
  -F date= -F time= -F location= -F rsvpUrl= \
  -F "image=@src/images/events/25_26/brunch_2026.webp"

curl localhost:8787/admin/api/access
curl -X POST localhost:8787/admin/api/access \
  -H 'Content-Type: application/json' \
  -d '{"emails":["a@hsg.ch","b@hsg.ch"],"expected":["a@hsg.ch"]}'
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

### `CF_API_TOKEN` — the second secret, and a broader one

Also an encrypted Worker secret, set the same way:

```bash
npx wrangler secret put CF_API_TOKEN
```

It exists so the board can edit their own allow-list from `/admin` instead of
needing the Cloudflare dashboard. **Without it the Access tab does not appear at
all** and everything else works exactly as before, so it is safe to leave unset.

Create it at **Cloudflare dashboard → My Profile → API Tokens → Create Token →
Create Custom Token**:

| field | value |
| --- | --- |
| Permissions | **Account** → `Access: Organizations, Identity Providers, and Groups` → **Edit** |
| Account Resources | **Include** → this account only |
| Zone Resources | none |
| TTL | your call, but see below |

**Be honest about what this token can do.** It is a wider credential than
`GITHUB_TOKEN`, and knowingly so:

- `GITHUB_TOKEN` is scoped to one repository's contents. This one is
  account-scoped, and Cloudflare offers **no groups-only permission** — the same
  permission that edits the board group also grants write access to the account's
  identity providers and Zero Trust organisation settings.
- Nothing in this Worker uses that reach: `board-access.js` only ever calls one
  URL, built from `CF_ACCOUNT_ID` and `CF_ACCESS_GROUP_ID`, neither of which comes
  from the browser. But the token itself is not limited to it.

If that trade is ever judged wrong, the fallback is the one that existed before:
delete the secret and manage the list in the dashboard. Nothing else breaks.

**Failure modes are explicit, not silent:**

- **not set** (or either var empty) → no Access tab; the endpoint answers 503
  naming `wrangler secret put CF_API_TOKEN`.
- **wrong, expired, malformed, or missing the permission** → 502 naming the exact
  permission to fix. **Read that message as a list of candidates, not a
  diagnosis** — it fires on `401` *and* `403` alike (`worker/index.js`), so it
  cannot tell an expired token from an under-permissioned one from a value that
  is simply not a token. A **doubled paste** is the one that has actually
  happened: the secret held the token twice, Cloudflare answered `401`, and the
  message blamed expiry and permissions. Diagnose in this order — the tab
  *appearing* already proves the secret is set, a wrong `CF_ACCESS_GROUP_ID`
  would be a `404` rather than this, and `wrangler whoami` confirms
  `CF_ACCOUNT_ID`; what is left is the value itself, which is testable **before**
  installing it:

  ```bash
  TOKEN=$(pbpaste); echo "length: ${#TOKEN}"   # a Cloudflare API token is 40 chars
  curl -sS -H "Authorization: Bearer $TOKEN" \
    https://api.cloudflare.com/client/v4/user/tokens/verify      # is the token alive?
  curl -sS -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOKEN" \
    "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/access/groups/$CF_ACCESS_GROUP_ID"
  ```

  `verify` active + group `200` = good token; active + `403` = the permission is
  wrong; `verify` failing = the token is dead. Note that **editing a token's
  permissions keeps the same value**, so a permission fix needs no
  `wrangler secret put` and no deploy.
- **rate-limited** (Cloudflare allows 1,200 API calls per five minutes per
  account) → 503 saying to wait a minute. This panel comes nowhere near it; a 429
  means something else on the account is busy.
- **somebody else edited the list first** → 409, and the change is refused rather
  than overwriting theirs. Cloudflare's API has no compare-and-swap, so the panel
  sends the list it was showing and the Worker checks it still matches.

To rotate: issue a new token, `wrangler secret put CF_API_TOKEN` again, delete
the old one. No deploy needed.

### `DEEPL_API_KEY` — the third secret, and the one the board can replace

What fills in an event's German, Croatian, Bosnian and Serbian title and
description when the board presses Save. Set it the same way as the others:

```bash
npx wrangler secret put DEEPL_API_KEY
```

A **DeepL API Free** key is enough and always will be — 1,000,000 characters a
month against roughly 400 for one event. A key ending `:fx` is a free-tier key
and `apiUrlFor()` sends it to `api-free.deepl.com` on its own; nothing needs
configuring for that.

**Unlike the other two, this one is not only yours.** A value in the
`ADMIN_SETTINGS` KV namespace overrides the secret, and the Translations tab in
`/admin` writes that value — so a board with no Cloudflare account can replace a
dead key themselves. The secret stays underneath as the fallback: removing the
board's key in the panel returns the deployment to whatever is set here.

That ordering is deliberate and worth keeping. The failure this guards against
is not a bug, it is a graduation: whoever created the DeepL account leaves, the
key eventually stops working, and the people left have no way to fix it and
nobody to ask. See the comment at the top of `worker/translate.js`.

**Failure modes are explicit, not silent.** No key at all → events still save,
untranslated, and the banner and the Translations tab both say so; translation
is never allowed to fail a save. A key DeepL rejects → the tab says *the key is
set but not working*, which is a different problem from *no key* and has a
different fix. Quota exhausted (456) → says so, and names when it resets.

#### The nightly sweep

`wrangler.jsonc` has a cron trigger (`17 4 * * *`) and the Worker exports a
`scheduled` handler for it. Once a day it looks for events whose translations
are missing, stale or half-filled, fixes up to five of them, and commits the lot
in one commit marked `[auto-translate]`.

It is the net, not the mechanism — an entry is normally translated as it is
saved. It exists for the save that hit a DeepL outage, and for entries a
maintainer commits straight to the repo. It never alarms: no key or no token is
a log line and a clean exit, because nobody is watching a scheduled run. A
concurrent save makes the fast-forward-only ref update fail, and that is logged
and **not** retried — the sweep is idempotent and runs again tomorrow.

**Testing it locally needs one temporary edit, and the documented recipe does
not work here as-is.** `wrangler dev --test-scheduled` serves `/__scheduled`,
but this Worker sits behind static assets with `run_worker_first` limited to
`/admin/api/*`, so that path is answered by `dist/404.html` and the handler
never runs. To exercise it, add `"/__scheduled*"` to `run_worker_first`, run:

```bash
npx wrangler dev --test-scheduled --port 8792
curl "http://127.0.0.1:8792/__scheduled?cron=17+4+*+*+*"
```

…read the `[translate]` lines, then **put `run_worker_first` back**. Shipping
that entry would put a public, unauthenticated path on the Worker.

#### Creating the settings store (once, out of band)

Until this exists, the panel shows the Translations tab read-only: the status is
reported, but there is no box to paste a new key into, because there would be
nowhere to put it.

```bash
npx wrangler kv namespace create ADMIN_SETTINGS
npx wrangler kv namespace create ADMIN_SETTINGS --preview   # for `wrangler dev`
```

Each prints an id. Add them to `wrangler.jsonc`:

```jsonc
"kv_namespaces": [
  { "binding": "SETTINGS", "id": "<id>", "preview_id": "<preview id>" }
]
```

Then deploy. The binding is called `SETTINGS` rather than `DEEPL` on purpose —
it is the store for anything the board should be able to change without a
maintainer, and the next such value should not need a second namespace.

It holds one key, `deepl.apiKey`, whose value is
`{"key": "…", "setAt": "…", "setBy": "…"}`. **A DeepL key in KV is a
credential**: it is readable by anyone who can run `wrangler kv key get` against
this account, which is the same set of people who can already read every other
secret's effects. It is never returned to the browser — the panel only ever sees
`configured`, the last four characters, who set it and this month's usage.

### Plain variables in `wrangler.jsonc`

| name | what it does |
| --- | --- |
| `GITHUB_REPO` | `alekswithk/yunited` |
| `GITHUB_BRANCH` | `main` — the branch that gets committed to and deployed |
| `CF_ACCESS_TEAM_DOMAIN` | the Zero Trust team hostname — turns on token verification |
| `CF_ACCESS_AUD` | the `/admin` Access application's Audience (AUD) tag |
| `CF_ACCOUNT_ID` | the Cloudflare account — half of the allow-list's address |
| `CF_ACCESS_GROUP_ID` | the Access **rule group** holding the board's email list |

None of these is a secret. The AUD tag appears in the Access login URL of anyone
who visits `/admin`; the account ID appears in every dashboard URL; a group ID
grants nothing without a token that can write to it. They belong in
`wrangler.jsonc` where they can be reviewed.

---

## Who can get in

**Cloudflare Access decides, from an email allow-list.** There is no login code in
this project and there should never be one. Adding a board member is still not a
code change, a deploy, a GitHub account or repo access — it is one address on one
list.

What changed is *where the board edits that list*: the **Access tab in `/admin`**,
rather than the Cloudflare dashboard. The dashboard still works and is the
break-glass path.

**Keep the distinction that makes this legitimate.** `access.js` does
authentication — is this person who they say they are, and has Access vouched for
them. That is entirely Cloudflare's, and nothing here participates in it.
`board-access.js` does membership — whose address is on the list Cloudflare
consults. Editing membership grants nobody anything by itself: an address that is
added still has to pass Access's own login, which means receiving a one-time code
in that mailbox (or an IdP assertion). The rule in `access.js` is intact.

### How it is wired

> **Zero Trust → Access → Groups →** a rule group (`yunited-board`) whose single
> Include rule is the list of emails
>
> **Zero Trust → Access → Applications → the `yunited.ch/admin` app → Policies →**
> include **that group**, not a literal list of addresses

The indirection is the whole trick: the policy is written once and never touched
again, and the Worker only ever rewrites the group. Set `CF_ACCESS_GROUP_ID` in
`wrangler.jsonc` to the group's UUID and the tab appears.

Setting it up from scratch, in this order:

1. Create the group with today's addresses.
2. Point the `/admin` policy at the group, and **confirm you can still sign in
   before deleting the old email rule**.
3. Create the token (above) and `wrangler secret put CF_API_TOKEN`.
4. Fill in `CF_ACCOUNT_ID` and `CF_ACCESS_GROUP_ID`, then deploy.

### What the panel refuses to do

Both rails are enforced in `guardChange` (`board-access.js`), server-side; the
greyed-out buttons in the panel are a courtesy, not the mechanism.

- **You cannot remove your own address.** The commonest way to lock yourself out.
- **You cannot empty the list.** The commonest way to lock *everyone* out.

There is deliberately no restriction on *who* may edit the list — any board member
with `/admin` access can add anyone, including re-adding themselves after being
removed. That was a considered choice (the board is small and hands over
annually), and it is the reason for the next paragraph.

### Who did it

Cloudflare's own logs will not tell you. A change made through this panel reaches
Cloudflare as the one shared API token: the Zero Trust admin activity log records
`Interface: API`, and account Audit Logs v2 records the *token's* name — never
which board member pressed the button.

So the Worker logs it: every change writes a line naming the actor's verified
Access email and what changed. Read it with `npx wrangler tail`, or in the
Workers observability logs (`observability.enabled` is on in `wrangler.jsonc`).
**That log line is the only per-person audit trail this feature has** — do not
remove it, and do not reduce it to "the list changed".

When someone leaves the board, removing their email is still the whole
off-boarding step: they lose access immediately, and they never had a credential
of their own to revoke.

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
