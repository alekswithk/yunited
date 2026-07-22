# Deploying the YUnited website

This is a **static site** — plain HTML, CSS, JS and two JSON files. There is no
backend, database or build step. That means hosting is **free** and the only
real cost is the domain name (~CHF 10–15/year).

This guide covers, in order:

1. [Get the code onto GitHub](#1-get-the-code-onto-github)
2. [Pick a clean domain name](#2-pick-a-clean-domain-name)
3. [Host it (recommended: Cloudflare Pages)](#3-host-it-recommended-cloudflare-pages)
4. [Alternative: zero-setup deploy with Netlify Drop](#4-alternative-zero-setup-with-netlify-drop)
5. [Updating the live site later](#5-updating-the-live-site-later)

---

## 1. Get the code onto GitHub

The repo is already initialised locally. To publish it:

1. Create a new **empty** repository on GitHub (no README, no .gitignore — we
   already have those). Call it e.g. `yunited-website`.
2. Connect this folder to it and push. GitHub shows you the exact URL; it looks
   like:

   ```bash
   git remote add origin https://github.com/<your-username>/yunited-website.git
   git branch -M main
   git push -u origin main
   ```

That's it — the code now lives on GitHub, and every host below can deploy
straight from it.

> No GitHub account? Skip to [section 4](#4-alternative-zero-setup-with-netlify-drop)
> for a drag-and-drop deploy that needs no git at all.

---

## 2. Pick a clean domain name

⚠️ **`yunited.hsg` cannot exist** — `.hsg` is not a real, purchasable domain
ending. Realistic options for a clean URL:

| Option | Example | How you get it |
|--------|---------|----------------|
| **Buy a `.ch` domain** (recommended) | `yunited.ch` | Register it yourself, ~CHF 10/yr |
| `.club` / `.org` | `yunited.club`, `yunited.org` | Same, any registrar |
| **University subdomain** | `yunited.unisg.ch` | Ask **SHSG / HSG IT** — only they can grant it |

Good registrars for `.ch`: **Infomaniak** (Swiss), **Cloudflare Registrar**
(at-cost, no markup), Namecheap, Gandi.

Recommendation: buy `yunited.ch` (you fully control it), and *optionally* also
ask SHSG whether they'll point `yunited.unisg.ch` at the same site.

---

## 3. Host it (recommended: Cloudflare Pages)

Free, fast global CDN, automatic HTTPS, redeploys on every `git push`.

1. Go to the **Cloudflare dashboard → Workers & Pages → Create → Pages →
   Connect to Git** and select the repo from step 1.
2. Build settings — this is a plain static site, so:
   - **Framework preset:** `None`
   - **Build command:** *(leave blank)*
   - **Build output directory:** `/`  (the repo root)
3. Click **Save and Deploy**. You get a live URL like
   `yunited-website.pages.dev`.
4. **Custom domains → Set up a domain →** enter `yunited.ch` and follow the DNS
   instructions. If you registered the domain at Cloudflare, DNS is automatic;
   otherwise point your registrar's nameservers to Cloudflare.

Done — `https://yunited.ch` is live with a valid SSL certificate.

**Netlify** works identically if you prefer it: New site → import from Git →
publish directory `/` → add custom domain.

---

## 4. Alternative: zero-setup with Netlify Drop

No git, no account setup, live in under a minute:

1. Open **https://app.netlify.com/drop**
2. Drag this whole project folder onto the page.
3. It goes live at a random `*.netlify.app` URL.
4. **Site settings → Domain management → Add a domain** → `yunited.ch`, then
   follow the DNS steps.

Downside: to update the site you re-drag the folder each time. The git-based
flow in section 3 is nicer long-term (edit, commit, push, done).

---

## 5. Updating the live site later

With the Cloudflare/Netlify + GitHub setup, publishing a change is just:

```bash
git add -A
git commit -m "Add spring semester events"
git push
```

The host rebuilds and redeploys automatically within ~30 seconds. For *content*
changes (events, board members) you only ever edit the two files in
`content/` — see [`README.md`](README.md) for that day-to-day workflow.

### Important: test over a real server, not the file

The site loads `content/events.json` and `content/members.json` at runtime,
which browsers only allow over `http(s)://`, **not** by double-clicking the HTML
file (`file://`). To preview locally, run this in the project folder:

```bash
python3 -m http.server
```

then open <http://localhost:8000>. All the hosts above serve over HTTPS, so this
is only a concern for local testing.
