# Editing the site — the admin panel

The board edits events, board members and partners through a small admin page at
**https://yunited.ch/admin**.

There is **no database**. Every save is a commit to this GitHub repo; Cloudflare
rebuilds the site and the change goes live in a minute or two. The build
re-validates every entry against `src/lib/schema.js` — and so does the admin page
before it saves anything, using the very same rules — so a malformed value cannot
reach the public site.

- **Events** → one file per event under `content/events/`.
- **Board members** → one file per member under `content/members/`.
- **Partners** → one file per partner under `content/partners/`.
- **Photos** you upload land in `src/images/…` and are optimized automatically at
  build time (resized, WebP, 1×/2× srcset).
- **Access** → not content at all, and not in this repo: it is the list of emails
  Cloudflare checks before letting anyone open the panel. Changes there take
  effect within seconds instead of after a rebuild.

Maintaining the code behind it: [`worker/README.md`](../worker/README.md).

---

## Signing in

Go to **https://yunited.ch/admin**. Cloudflare asks for your email, sends you a
one-time code, and lets you in. That is the whole login — there is no second
account and nothing to install.

If you get "access denied", your email is not on the allow-list yet. Ask anyone
who is already on it to add you from the panel's **Access** tab — it takes about
ten seconds (see [Giving someone access](#giving-someone-access)).

---

## Using it day to day

1. Pick a tab: **Events**, **Board members**, **Partners** or **Access**.
2. Press **Add …**, or **Edit** on something that is already there.
3. Fill in the fields and press **Save**.

The first three tabs are the website's content. **Access** is different: it is
the list of people who can open this page, it changes within seconds rather than
after a rebuild, and it is covered in [Giving someone
access](#giving-someone-access).

The page has a **`?` button in the bottom-right corner** with the full
walkthrough — every field, whether it is required, and a worked example. That
help is written for the board and kept next to the thing it describes, so it is
the place to look first.

The three things most worth knowing:

- **Never mark an event "past".** Past vs. upcoming is decided automatically from
  the date. Leave the date **empty** for a TBA event — it shows at the top of
  Upcoming.
- **Board order**: the `Order` field sets the sequence. `1` is the President and
  gets the large card, then `2`, `3`, … Each number must be unique.
- **A board seat can have a role but no name yet** — it shows as "To be
  announced".

### Photos

JPG, PNG or WebP, ideally under 1 MB (5 MB is the hard limit). **Photos straight
off an iPhone are usually HEIC and will be refused** — share or export the photo
first and it saves as JPEG. Upload the original at full size; the site makes its
own resized copies.

### How long until it's live

- **1–2 minutes** for the change to appear on yunited.ch in English.
- **Up to about 5 minutes** for the German, Bosnian, Croatian and Serbian
  versions of an event's title and description. Those are machine-translated
  automatically after you save, which triggers a second rebuild. You don't have
  to do anything.

Board members' names, roles and bios are **never translated** — they appear
exactly as typed on every language's page. That is deliberate: a bio is somebody
describing themselves in their own words, and machine translation mangles it.
(It once turned the bio "krastavac" into "Küstenfischer" on the German page.)

---

## Giving someone access

**In the panel, under the `Access` tab.** Type their email address, press
**Add**, and they can sign in straight away — they go to yunited.ch/admin, type
that same address and Cloudflare emails them a one-time code. No GitHub account,
no code change, no deploy, nothing to install.

Use the address they will actually type. The code goes to that mailbox, so an old
or misspelled address doesn't fail loudly — the email simply never arrives.

When someone leaves the board, press **Remove** next to their address. Their
access ends immediately, and that is the whole off-boarding step: they never held
a credential of their own.

Two things the page will not let you do, both so the board cannot lock itself
out:

- **You cannot remove your own address.** To hand over your seat, add the new
  person first and ask them to remove you.
- **You cannot remove the last one.** Add the replacement before removing the
  old address.

Anyone on the list can change the list, and every change is recorded with the
email of whoever made it.

**If nobody can get in at all** — the list was emptied by accident, or the last
address is a mailbox no one can reach — it can still be repaired by whoever looks
after the Cloudflare account:

> **Zero Trust → Access → Groups → the `yunited-board` group**

---

## If something goes wrong

- **A red message on the page** tells you what to fix — usually a required field
  left empty, a link pasted without the `https://`, or a photo in the wrong
  format. Nothing is saved until it is right.
- **"Someone else saved a change a moment ago"** — two people saved at nearly the
  same time. Reload the page and redo your edit; nothing was lost on either side.
- **"Your session has expired"** — reload the page and sign in again.
- **Nothing is ever half-saved.** A change either goes through completely or not
  at all, photo included.
- **The change saved but the site still looks old after five minutes** — check
  the repository's Actions tab, or ask a maintainer to look at the Cloudflare
  build log. The most likely cause is an unrelated build failure.

---

## For maintainers

Setup, deployment, the `GITHUB_TOKEN` secret and the Worker's internals are all
in **[`worker/README.md`](../worker/README.md)**.

### What replaced what

This panel replaced **Sveltia CMS** (removed in the same change). Sveltia needed
every board member to hold a GitHub account with write access to the repo, plus a
GitHub OAuth app and a second Worker to broker the login. It also kept its own
description of the content model in `public/admin/config.yml`, which had to be
hand-synced with `src/lib/schema.js` — and drifted, silently breaking four
events' image paths and with them the deploy.

Now: Cloudflare Access decides who gets in, one server-held token does the
committing, and the form is generated from the same definitions the server
validates with.
