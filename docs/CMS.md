# Editing the site — the CMS

The board edits events and board members through a small admin app at
**https://yunited.ch/admin**, powered by [Sveltia CMS](https://sveltiacms.app).

There is **no database**. Every save is a commit to this GitHub repo; Cloudflare
rebuilds the site (~1 minute) and the change goes live. The build re-validates
every entry against `src/lib/schema.js`, so a malformed value can never reach the
public site — at worst the deploy is skipped and the previous version stays up.

- **Events** → one file per event under `content/events/`.
- **Board members** → one file per member under `content/members/`.
- **Photos** you upload land in `src/images/events/` or `src/images/members/` and
  are automatically optimized at build time (resized, WebP, 1×/2× srcset).

---

## One-time setup (done once, by an admin)

The CMS logs editors in with their GitHub account. That login is brokered by a
tiny Cloudflare Worker ([`sveltia-cms-auth`](https://github.com/sveltia/sveltia-cms-auth)).
You deploy it once.

### 1. Deploy the auth worker

```bash
git clone https://github.com/sveltia/sveltia-cms-auth.git
cd sveltia-cms-auth
npx wrangler deploy
```

Note the deployed URL, e.g. `https://sveltia-cms-auth.<your-subdomain>.workers.dev`.

### 2. Create a GitHub OAuth App

Go to **https://github.com/settings/applications/new** and set:

- **Application name**: `Yunited CMS`
- **Homepage URL**: `https://yunited.ch`
- **Authorization callback URL**: `<WORKER_URL>/callback`
  (e.g. `https://sveltia-cms-auth.<your-subdomain>.workers.dev/callback`)

Click **Register**, then **Generate a new client secret**. Copy the **Client ID**
and **Client secret**.

### 3. Give the worker its secrets

In the Cloudflare dashboard → **Workers & Pages → sveltia-cms-auth → Settings →
Variables and Secrets**, add:

| Name                   | Value                                  | Encrypt? |
| ---------------------- | -------------------------------------- | -------- |
| `GITHUB_CLIENT_ID`     | the Client ID from step 2              | no       |
| `GITHUB_CLIENT_SECRET` | the Client secret from step 2          | **yes**  |
| `ALLOWED_DOMAINS`      | `yunited.ch`                           | no       |

Redeploy the worker if prompted.

### 4. Point the CMS at the worker

In [`public/admin/config.yml`](../public/admin/config.yml), set `base_url` under
`backend:` to your worker URL (no trailing slash):

```yaml
backend:
  name: github
  repo: alekswithk/yunited
  branch: main
  base_url: https://sveltia-cms-auth.<your-subdomain>.workers.dev
```

Commit and push. After Cloudflare redeploys, visit `https://yunited.ch/admin`
and click **Sign in with GitHub**.

### 5. Add the board as editors

Anyone who edits needs write access to the repo:
**GitHub → repo → Settings → Collaborators → Add people**. They then log in at
`/admin` with their own GitHub account; their edits are committed under their name.

---

## Using the CMS day to day

1. Go to **https://yunited.ch/admin** and sign in.
2. Pick **Events** or **Board members**.
3. **New** to add, or click an entry to edit. Fill in the fields (the editor
   enforces the date/time/ID formats) and drop in a photo.
4. **Save & publish**. The site updates within about a minute.

Notes for editors:
- **Never mark an event "past".** Past vs. upcoming is decided automatically from
  the date. Leave the date **empty** for a "TBA" event — it shows at the top.
- **Board order**: the `Order` field controls the sequence. `1` is the President
  and gets the large card; then `2`, `3`, … Each number must be unique.
- A board seat can have a **role but no name yet** — it shows as "To be announced".

---

## Maintenance

- **Update the CMS**: bump `@sveltia/cms` in `package.json` (`npm i -D @sveltia/cms@latest`)
  and commit. The bundle is re-vendored into `/admin` at build time by
  `scripts/vendor-cms.mjs` (the built file is gitignored, never committed).
- **CSP**: `/admin` has its own Content-Security-Policy in [`public/_headers`](../public/_headers).
  If something fails and the browser console shows a CSP violation naming an origin,
  add that origin to the `/admin/*` policy. In particular, if you host the worker
  on a **custom domain** (not `*.workers.dev`), add it to `connect-src`. Sveltia's
  toolbar icons and fonts come from Google Fonts, so `fonts.googleapis.com`
  (style-src) and `fonts.gstatic.com` (font-src) are allowed there — without them
  the icons show as raw text like `cloud_upload`.
