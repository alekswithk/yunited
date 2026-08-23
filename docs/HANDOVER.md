# Handover — what the website depends on, and who owns it

**Who this is for:** whoever is handing yunited.ch over, and whoever is taking it
on. It lists every account and credential the site needs, what breaks without
each one, and how to replace it.

**The short version.** The board can run the site day to day from
[yunited.ch/admin](https://yunited.ch/admin) with no accounts of their own — that
is the whole design, and it is documented in [`ADMIN.md`](ADMIN.md). What is
below is the layer underneath: the things a *maintainer* holds. Most of them sit
on a personal account today, and that is the actual risk to the club, not the
code.

---

## The rule worth following

**Own the accounts from `yunited@shsg.ch`, not from a personal address.**

Nothing here is expensive — the whole site runs on free tiers. The cost of a
handover is not money, it is that a credential issued from someone's personal
account leaves when they do, and the people left have no way to reissue it and
often no idea it existed. A club-owned identity turns every handover into a
password change.

The git history already shows the pattern: the very first commit was authored by
`Yunited <yunited@shsg.ch>`, and every commit since has been a personal account.

---

## The accounts

### GitHub — the repository

Holds the site and every piece of content. **Currently a personal account
(`alekswithk`).**

If it disappears, the board's saves stop (the panel commits here) and Cloudflare
has nothing to build. Nobody loses the *site* — it keeps serving whatever was
last deployed — but nothing can be changed.

**Do at handover:** move the repository to a club-owned GitHub organisation, and
add the incoming maintainer as an owner. Transferring keeps the history, the
issues and the URL redirect. Then reissue `GITHUB_TOKEN` (below) from the new
owner, because a fine-grained token belongs to the person who made it.

### Cloudflare — hosting, DNS, the Worker, and Access

Runs everything: the static site, the `/admin` Worker, the login in front of it,
and the DNS for yunited.ch.

**Do at handover:** the incoming maintainer needs access to this account. A
Cloudflare account can have multiple members — add them before you leave rather
than sharing a password afterwards.

### DeepL — translations

A **DeepL API Free** account. Its key fills in each event's German, Croatian,
Bosnian and Serbian text.

If it lapses, events still save; they simply appear in the language they were
written in on every page, and `/admin`'s Translations tab says so. **The board
can fix this themselves** by pasting a new free key into that tab — which is the
one credential on this page that does not need a maintainer at all. The
`ADMIN_SETTINGS` store that makes it writable **exists and is bound**
(`wrangler.jsonc`, created 2026-08-21), so nothing is outstanding here; see
`worker/README.md` if it ever has to be recreated.

### Formspree — the contact form

Receives what the public contact form sends. If it lapses, the form stops
delivering, quietly. Worth testing once a year by sending yourself a message.

### The domain

`yunited.ch` — registered and paid for somewhere. **Find out where, write it
here, and put the renewal on a calendar the club owns.** This is the one item on
this page whose failure is not recoverable in an afternoon.

---

## The credentials

All three are **encrypted Worker secrets**, set with `npx wrangler secret put
<NAME>`. None is in the repository; none reaches the browser. Full detail, and
what each failure looks like from the board's side, is in
[`worker/README.md`](../worker/README.md).

| secret | what it does | what breaks without it | replacing it |
| --- | --- | --- | --- |
| `GITHUB_TOKEN` | lets `/admin` commit | every save fails, with a message naming this token | new fine-grained PAT, `Contents: Read and write` on this repo only |
| `CF_API_TOKEN` | lets the board edit their own access list | the Access tab stops working; add and remove people in the Zero Trust dashboard instead | new API token with `Access: Organizations, Identity Providers, and Groups: Edit` |
| `DEEPL_API_KEY` | translates events | events save untranslated; the panel says so | a free key from deepl.com/pro-api — **or let the board paste one in the Translations tab** |

Two things worth knowing:

- **`GITHUB_TOKEN` is non-expiring** (changed 2026-08-06). It used to expire
  annually, which meant the board would one day lose the ability to publish with
  no warning anyone would see.
- **`CF_API_TOKEN` is broader than it looks.** Cloudflare has no groups-only
  permission, so it can also write the account's identity providers and Zero
  Trust settings. Accepted deliberately; the fallback is to delete the secret,
  which returns `/admin` to exactly what it was.

---

## Who can open /admin

Board membership is **not** a credential in this repo. It is an Access rule group
(`yunited-board`) that the board edits themselves in the panel's Access tab.
Adding an address grants nothing until that person passes Cloudflare's own login.

**Break-glass**, if nobody can get in at all: Cloudflare Zero Trust → Access →
Groups → `yunited-board`. Steps in [`ADMIN.md`](ADMIN.md).

---

## A five-minute check that everything still works

Once a semester, or on the day you hand over:

1. **Save something in `/admin`** — change an event's time and change it back. A
   commit should appear in the repository within seconds, and the event's row
   should still badge *translated*.
2. **Open the Translations tab.** It should say the key is working, with this
   month's usage.
3. **Send yourself a message** through the contact form on yunited.ch.
4. **Sign in as somebody else**: add a throwaway address in the Access tab, sign
   in with it in a private window, then remove it and confirm sign-in now fails.
   (Cloudflare's one-time code comes from `noreply@notify.cloudflare.com` and
   Gmail often files it as spam — worth telling a new board member.)

If all four pass, the club can run the site without you.
