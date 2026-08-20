// The admin API behind /admin/api/*.
//
// This is the only server-side code in the project. Everything else is a static
// site rendered at build time; this Worker exists for one reason — the board
// needs to change content without a GitHub account, and something has to hold
// the token that commits on their behalf.
//
// HOW A SAVE TRAVELS
//
//   browser  ──POST /admin/api/save──▶  this Worker  ──GitHub API──▶  a commit
//                                              │
//                                    Cloudflare rebuilds the site (~1–2 min)
//
// The token lives in the encrypted GITHUB_TOKEN secret and never leaves this
// Worker. The browser never sees it, never talks to GitHub, and cannot: the
// /admin Content-Security-Policy is connect-src 'self'.
//
// WHAT PROTECTS THIS ENDPOINT. Cloudflare Access, in front of yunited.ch/admin,
// which covers /admin/api/* because Access matches on path prefix. There is no
// login code here on purpose — see worker/access.js. Every route below also
// re-checks the signed Access token when CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD
// are configured.
//
// THE ONE ROUTE THAT IS NOT ABOUT CONTENT is /admin/api/access, which reads and
// rewrites the email allow-list Access checks against — so the board can add a
// new member themselves instead of needing the Cloudflare dashboard. It still
// authenticates nobody; see worker/board-access.js for the distinction and why it
// does not contradict the paragraph above.
//
// EVERY REQUEST IS VALIDATED SERVER-SIDE. The form does its own checking, but
// nothing here trusts it: each save is parsed, coerced and then run through the
// very Zod schema the site build uses (src/lib/schema.js). If it passes here it
// will build; if it fails, nothing is committed and the board gets the field
// name and the reason.
import {
  COLLECTIONS,
  MAX_IMAGE_BYTES,
  isImageRequired,
  publicShape,
} from "./collections.js";
import { github } from "./github.js";
import { identity, verifyAccessJwt } from "./access.js";
import {
  accessGroup,
  conflict,
  describeChange,
  guardChange,
  normalizeEmails,
  validateEmail,
} from "./board-access.js";
import {
  IMAGE_EXTENSIONS,
  buildEntry,
  coerceField,
  extensionOf,
  imagePathFor,
  uniqueSlug,
} from "./lib.js";
import { withTranslationState } from "./translate.js";

export default {
  /**
   * @param {Request} request
   * @param {Record<string, string> & { ASSETS: { fetch: (r: Request) => Promise<Response> } }} env
   */
  async fetch(request, env) {
    const url = new URL(request.url);

    // wrangler.jsonc routes only /admin/api/* here (`run_worker_first`), so in
    // production this branch is effectively unreachable. It matters for
    // `wrangler dev`, where the Worker sees every request, and it keeps the
    // static site working if that route list is ever widened.
    if (!url.pathname.startsWith("/admin/api/")) {
      return env.ASSETS.fetch(request);
    }

    try {
      return await handle(request, env, url);
    } catch (error) {
      // Anything uncaught is a bug or an upstream being unavailable. Log the
      // detail for `wrangler tail`, and tell the board something they can act on.
      console.error("[admin]", error);

      // Which upstream failed decides which instruction is useful, and the two
      // have different secrets to rotate. board-access.js labels its own errors;
      // everything else here talks to GitHub.
      const cloudflare = error?.service === "cloudflare";

      // A token that is wrong, expired, or missing a permission is the single
      // most likely thing to be misconfigured here, and both APIs say so plainly
      // ("Bad credentials"). Buried inside a generic 500 that reads as "try
      // again", it would send someone hunting for an outage instead of rotating a
      // secret. So name it — and name the right one.
      if (error?.status === 401 || error?.status === 403) {
        return json(
          {
            ok: false,
            error: cloudflare
              ? "The admin panel's Cloudflare token was rejected, so nothing was changed. " +
                "It is probably expired, or missing 'Access: Organizations, Identity " +
                "Providers, and Groups: Edit'. A maintainer needs to issue a new one and " +
                "run: wrangler secret put CF_API_TOKEN"
              : "The admin panel's GitHub token was rejected, so nothing was changed. " +
                "It is probably expired, or missing 'Contents: Read and write' on this " +
                "repository. A maintainer needs to issue a new one and run: " +
                "wrangler secret put GITHUB_TOKEN",
          },
          502,
        );
      }

      // Cloudflare's API allows 1,200 calls per five minutes across the whole
      // account. Nothing this panel does approaches that, so a 429 means
      // something else on the account is busy — worth saying, because "try
      // again" is genuinely the right advice here and a 500 does not sound like
      // it.
      if (error?.status === 429) {
        return json(
          {
            ok: false,
            error:
              "Cloudflare is rate-limiting us at the moment, so nothing was changed. " +
              "Wait a minute and try again.",
          },
          503,
        );
      }

      // "Nothing was changed" is a promise this code can actually keep: a save
      // is one commit built at the very end (see github.js), so any failure
      // before the ref update leaves the repo exactly as it was. A failed
      // Cloudflare write is likewise a single PUT that either applied or did not.
      return json(
        {
          ok: false,
          error:
            `Something went wrong talking to ${cloudflare ? "Cloudflare" : "GitHub"}, and ` +
            "nothing was changed. Please try again, and if it keeps happening send this " +
            "to a maintainer: " +
            String(error?.message ?? error),
        },
        500,
      );
    }
  },
};

/**
 * @param {Request} request
 * @param {Record<string, string>} env
 * @param {URL} url
 */
async function handle(request, env, url) {
  // Defence in depth on top of Access itself; a no-op unless the two
  // CF_ACCESS_* values are configured. See worker/access.js.
  const verified = await verifyAccessJwt(request, env);
  if (!verified.ok) {
    return json(
      {
        ok: false,
        error:
          `Not signed in: ${verified.reason}. Reload the page to sign in again.` +
          // Running locally there is no Access in front, so every request looks
          // unauthenticated. Say so here rather than leaving someone to work out
          // why `npm run admin:dev` 403s on a machine that is obviously theirs.
          (verified.local ? " (Running locally? See the .dev.vars note in worker/README.md.)" : ""),
      },
      403,
    );
  }

  const route = url.pathname.slice("/admin/api/".length);
  // Each route declares which upstream it needs, because they have different
  // secrets and a missing one has to name itself. Before the access list existed
  // this was a single unconditional GITHUB_TOKEN check, which would have answered
  // "there is no GitHub token" to a request that never wanted GitHub.
  const match = {
    "GET state": { handler: getState, needs: "github" },
    "POST save": { handler: postSave, needs: "github" },
    "POST delete": { handler: postDelete, needs: "github" },
    "GET access": { handler: getAccess, needs: "cloudflare" },
    "POST access": { handler: postAccess, needs: "cloudflare" },
  }[`${request.method} ${route}`];

  // Route first, THEN check the configuration. The other order answers "no such
  // endpoint" with "there is no token", which sends whoever is debugging after
  // the wrong thing entirely.
  if (!match) {
    return json({ ok: false, error: `No such endpoint: ${request.method} ${url.pathname}` }, 404);
  }

  const missing = missingConfig(match.needs, env);
  if (missing) return json({ ok: false, error: missing }, 503);

  return match.handler(request, env);
}

/**
 * The sentence to answer with when this route's upstream is not configured, or
 * null when it is.
 *
 * Each one names the exact command that fixes it. A 503 that says only "not
 * configured" is the same as no message at all to whoever inherits this.
 */
function missingConfig(needs, env) {
  if (needs === "github" && !env.GITHUB_TOKEN) {
    return (
      "The admin panel has no GitHub token configured, so it cannot read or " +
      "save anything. A maintainer needs to run: wrangler secret put GITHUB_TOKEN"
    );
  }

  if (needs === "cloudflare" && !accessConfigured(env)) {
    return (
      "The access list is not set up in this deployment, so it cannot be read or " +
      "changed here — add or remove board members in the Cloudflare Zero Trust " +
      "dashboard instead. A maintainer needs to set CF_ACCOUNT_ID and " +
      "CF_ACCESS_GROUP_ID in wrangler.jsonc and run: wrangler secret put CF_API_TOKEN"
    );
  }

  return null;
}

/**
 * Is the access list editable in this deployment?
 *
 * Checked in two places on purpose: getState reports it so the panel can leave
 * the tab out entirely, and the endpoints check it again so the answer does not
 * depend on the browser having been told the truth.
 */
function accessConfigured(env) {
  return Boolean(env.CF_API_TOKEN && env.CF_ACCOUNT_ID && env.CF_ACCESS_GROUP_ID);
}

// --- GET /admin/api/state ----------------------------------------------------
// Everything the page needs to draw itself: the form definitions and the
// current contents of the repo. One round trip, so the panel has no partially
// loaded state to reason about.

async function getState(request, env) {
  const gh = github(env);
  const content = await gh.readContent();

  const entries = {};
  for (const [name, collection] of Object.entries(COLLECTIONS)) {
    const prefix = collection.dir.replace(/^content\//, "") + "/";
    entries[name] = await withTranslationState(
      name,
      Object.entries(content)
        .filter(([path]) => path.startsWith(prefix))
        .map(([path, data]) => ({ file: path.slice(prefix.length), data }))
        .sort((a, b) => a.file.localeCompare(b.file)),
    );
  }

  return json({
    ok: true,
    user: identity(request),
    repo: { name: gh.repo, branch: gh.branch },
    collections: publicShape(),
    entries,
    // Sections that are not content collections. Deliberately just a flag: this
    // does NOT call the Cloudflare API, because loading the panel must not depend
    // on a second service. If the access list is unreachable, that is the access
    // tab's problem to report, not a reason for the Events tab to be empty.
    sections: { access: { enabled: accessConfigured(env) } },
  });
}

// --- GET /admin/api/access ---------------------------------------------------
// The email allow-list that decides who can open this panel at all. Read live
// from the Cloudflare Access rule group, never cached here — a stale answer on
// this list is somebody being told they still have access when they don't.

async function getAccess(request, env) {
  const { emails } = await accessGroup(env).read();

  // `you` is what the panel uses to mark and disable your own Remove button. It
  // is a convenience, not the guard — guardChange is (see below).
  return json({ ok: true, emails, you: identity(request).email });
}

// --- POST /admin/api/access --------------------------------------------------
// Replace the allow-list. The whole list, not a diff: Cloudflare's API has no
// append and no compare-and-swap, so the panel sends the state it wants and the
// state it believed it was starting from.

async function postAccess(request, env) {
  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.emails)) {
    return json({ ok: false, error: "The list of addresses was missing from that request." }, 400);
  }

  const next = normalizeEmails(body.emails);
  if (next.length !== body.emails.length) {
    // Normalising dropped something: a blank, a duplicate, or a non-string. The
    // panel never sends any of those, so this is a bug or a hand-made request
    // rather than something to word gently.
    return json({ ok: false, error: "That list contained a blank or duplicate address." }, 400);
  }

  for (const email of next) {
    const problem = validateEmail(email);
    if (problem) return json({ ok: false, error: problem, field: "access-input" }, 400);
  }

  const group = accessGroup(env);
  const { group: raw, emails: current } = await group.read();

  // Somebody else changed the list while this page was open. Refusing is the
  // whole point: the alternative is quietly reinstating an address that was just
  // removed, or dropping one that was just added.
  if (conflict(body.expected, current)) {
    return json(
      {
        ok: false,
        error:
          "Someone else changed the access list a moment ago, so this change wasn't " +
          "applied — nothing was lost on their side or yours. Please reload the page and " +
          "make your change again.",
      },
      409,
    );
  }

  const actor = identity(request).email;
  const refusal = guardChange({ current, next, actor });
  if (refusal) return json({ ok: false, error: refusal }, 400);

  const emails = await group.write(raw, next);

  // The only record of WHO did this. Cloudflare's own audit log attributes the
  // change to the API token, which is the same token for every board member, so
  // without this line there is no way to tell who added an address. Visible with
  // `npx wrangler tail`.
  console.log(`[admin] access list: ${describeChange(current, emails)} — by ${actor ?? "unknown"}`);

  return json({
    ok: true,
    emails,
    you: actor,
    message: `Access list updated: ${describeChange(current, emails)}.`,
  });
}

// --- POST /admin/api/save ----------------------------------------------------
// Create or update one entry, with an optional photo, in a single commit.

async function postSave(request, env) {
  const form = await request.formData();

  const collectionName = String(form.get("collection") ?? "");
  const collection = COLLECTIONS[collectionName];
  if (!collection) return json({ ok: false, error: "Unknown section." }, 400);

  // "" for a new entry; otherwise the filename of the entry being edited.
  const existingFile = String(form.get("file") ?? "").trim();
  if (existingFile && !/^[a-z0-9-]+\.json$/.test(existingFile)) {
    return json({ ok: false, error: "That entry's filename looks wrong — reload and try again." }, 400);
  }

  const gh = github(env);
  const content = await gh.readContent();
  const dirPrefix = collection.dir.replace(/^content\//, "") + "/";
  const siblings = Object.entries(content)
    .filter(([path]) => path.startsWith(dirPrefix))
    .map(([path, data]) => ({ file: path.slice(dirPrefix.length), data }));

  const existing = existingFile ? siblings.find((s) => s.file === existingFile) : null;
  if (existingFile && !existing) {
    return json(
      { ok: false, error: "That entry no longer exists — someone may have deleted it. Reload the page." },
      409,
    );
  }

  // 1. Coerce the raw form strings into the values that go in the JSON.
  const values = {};
  for (const field of collection.fields) {
    values[field.name] = coerceField(form.get(field.name), field);
  }

  // 2. Empty required fields, reported in the order the board sees them.
  //
  //    The schema catches these anyway, at step 5. Doing it here is about which
  //    message comes back: an event submitted with no title and no photo would
  //    otherwise be told about the photo, because the photo is checked earlier.
  //    It also stops a blank title from being turned into a filename — harmless,
  //    since nothing is committed when validation fails, but "-2026.json" is not
  //    a thing worth computing.
  for (const field of collection.fields) {
    const value = values[field.name];
    if (field.required && (value === null || value === "")) {
      return json({ ok: false, error: `${field.label} is required.`, field: field.name }, 400);
    }
  }

  const now = new Date();

  // 3. The filename. A NEW entry gets one derived from its title/role/name; an
  //    EXISTING entry keeps the one it has, even if the title changes.
  //
  //    Renaming would be a delete-plus-create, and buys nothing: the filename
  //    is not user-facing anywhere. There are no per-event pages, so no URL
  //    depends on it, and eventSchema requires a file that carries an explicit
  //    `id` to keep matching its filename — which renaming would break for
  //    every entry created before this panel existed. Fixing a typo in a title
  //    should not churn history or risk that.
  const file = existing
    ? existing.file
    : `${uniqueSlug(
        collection.slugFor(values, now),
        siblings.map((s) => s.file.replace(/\.json$/, "")),
      )}.json`;
  const slug = file.replace(/\.json$/, "");

  const changes = [];

  // 4. The photo, if one was picked. An entry keeps its current photo when the
  //    field is left alone, which is what makes "edit the time and save" not
  //    require re-uploading the image.
  const upload = form.get("image");
  const hasUpload = upload && typeof upload === "object" && "size" in upload && upload.size > 0;

  // Normalize a leading slash off the value already on file.
  //
  // This is repairing damage, not being lenient. Sveltia stored an event's photo
  // as "/images/events/…" — its `public_folder` prepended to the filename — while
  // the schema requires a path relative to src/ with no leading slash. Four
  // events on main were saved that way and each one broke the build outright, so
  // the deploy that would have published them never ran.
  //
  // Without this, /admin would inherit the problem in its most frustrating form:
  // a board member opening one of those events, changing the time and pressing
  // Save would be told the Photo is invalid — a field they never touched, on an
  // entry they did not break. Trimming it here means saving such an entry
  // repairs it instead. New uploads never take this path; they are built by
  // imagePathFor() and are correct by construction.
  let imageValue = existing ? existing.data[collection.imageField] ?? null : null;
  if (typeof imageValue === "string") imageValue = imageValue.replace(/^\/+/, "");

  if (hasUpload) {
    const extension = extensionOf(upload.name);

    if (/^hei[cf]$/.test(extension)) {
      return json(
        {
          ok: false,
          error:
            "That photo is a HEIC file, which the site can't process. On an iPhone, " +
            "either share/export the photo (which saves it as JPEG) or set " +
            "Settings → Camera → Formats → “Most Compatible”, then upload it again.",
          field: collection.imageField,
        },
        400,
      );
    }
    if (!IMAGE_EXTENSIONS.includes(extension)) {
      return json(
        {
          ok: false,
          error: `“${upload.name}” isn't an image the site can use. Please upload a JPG, PNG or WebP.`,
          field: collection.imageField,
        },
        400,
      );
    }
    if (upload.size > MAX_IMAGE_BYTES) {
      const mb = (upload.size / (1024 * 1024)).toFixed(1);
      return json(
        {
          ok: false,
          error: `That photo is ${mb} MB, which is too big (the limit is 5 MB). Please pick a smaller one — under 1 MB is ideal.`,
          field: collection.imageField,
        },
        400,
      );
    }

    // Stored relative to src/, which is exactly what the content JSON holds.
    const newPath = imagePathFor(collection.imageDir(values, now), slug, extension);
    changes.push({
      path: `src/${newPath}`,
      content: new Uint8Array(await upload.arrayBuffer()),
    });

    // Replacing a photo with one of a different file type would otherwise leave
    // the old file behind for good — nothing references it, but it stays in the
    // repo and in the deploy. Clean it up, unless some other entry uses it.
    const previous = imageValue;
    if (previous && previous !== newPath && !isImageUsedElsewhere(previous, content, file, dirPrefix)) {
      changes.push({ path: `src/${previous}`, remove: true });
    }
    imageValue = newPath;
  }

  values[collection.imageField] = imageValue;

  if (!imageValue && isImageRequired(collection)) {
    return json(
      { ok: false, error: `Please choose a photo — an ${collection.singular} can't be saved without one.`, field: collection.imageField },
      400,
    );
  }

  // 5. Validate against the real schema. Anything that gets past this line is
  //    guaranteed to survive the next build, because the build runs this exact
  //    check on this exact object.
  const carried = {};
  for (const key of collection.carry) {
    if (existing && existing.data[key] !== undefined) carried[key] = existing.data[key];
  }
  const entry = buildEntry([...collection.fields, { name: collection.imageField }], values, carried);

  const result = collection.schema.safeParse(entry);
  if (!result.success) {
    return json({ ok: false, error: firstProblem(collection, result), field: firstField(result) }, 400);
  }

  // 6. Commit. JSON.stringify with two-space indent and a trailing newline, to
  //    match every file already in content/ — a save should show up in `git
  //    diff` as the fields that changed and nothing else.
  changes.push({
    path: `${collection.dir}/${file}`,
    content: JSON.stringify(toFile(result.data, entry), null, 2) + "\n",
  });

  const who = identity(request).email;
  const label = entry.title ?? entry.role ?? entry.name ?? slug;
  const commit = await commitOrConflict(gh, changes, [
    `content: ${existing ? "update" : "add"} ${collection.singular} “${label}”`,
    "",
    `Saved from /admin${who ? ` by ${who}` : ""}.`,
  ].join("\n"));
  if (commit instanceof Response) return commit;

  return json({
    ok: true,
    message: existing ? "Changes saved." : `${capitalize(collection.singular)} added.`,
    file,
    commit,
    entries: await withTranslationState(collectionName, collectionAfter(siblings, file, toFile(result.data, entry))),
  });
}

// --- POST /admin/api/delete --------------------------------------------------

async function postDelete(request, env) {
  const { collection: collectionName, file } = await request.json();
  const collection = COLLECTIONS[collectionName];
  if (!collection) return json({ ok: false, error: "Unknown section." }, 400);
  if (!/^[a-z0-9-]+\.json$/.test(String(file ?? ""))) {
    return json({ ok: false, error: "That entry's filename looks wrong — reload and try again." }, 400);
  }

  const gh = github(env);
  const content = await gh.readContent();
  const dirPrefix = collection.dir.replace(/^content\//, "") + "/";
  const entry = content[`${dirPrefix}${file}`];
  if (!entry) {
    return json({ ok: false, error: "That entry has already been deleted." }, 409);
  }

  const changes = [{ path: `${collection.dir}/${file}`, remove: true }];

  // Take the photo with it, so deleting a five-year-old event does not leave
  // its picture in the repo forever. Guarded, in case two entries share one.
  const image = entry[collection.imageField];
  if (image && !isImageUsedElsewhere(image, content, file, dirPrefix)) {
    changes.push({ path: `src/${image}`, remove: true });
  }

  const who = identity(request).email;
  const label = entry.title ?? entry.role ?? entry.name ?? file;
  const commit = await commitOrConflict(gh, changes, [
    `content: remove ${collection.singular} “${label}”`,
    "",
    `Deleted from /admin${who ? ` by ${who}` : ""}.`,
  ].join("\n"));
  if (commit instanceof Response) return commit;

  const siblings = Object.entries(content)
    .filter(([path]) => path.startsWith(dirPrefix))
    .map(([path, data]) => ({ file: path.slice(dirPrefix.length), data }));

  return json({
    ok: true,
    message: `${capitalize(collection.singular)} deleted.`,
    commit,
    entries: await withTranslationState(collectionName, collectionAfter(siblings, file, null)),
  });
}

// --- helpers -----------------------------------------------------------------

/**
 * Commit, turning the one failure the board can actually do something about
 * into an instruction rather than a stack trace.
 *
 * github.js updates the branch without `force`, so GitHub requires a
 * fast-forward. If two board members save within the same few seconds, the
 * second one's ref update is rejected — which is the correct outcome, since the
 * alternative is silently discarding the first one's commit. All it needs is a
 * reload and a retry.
 *
 * Returns either the commit or a ready-made Response for the caller to hand
 * back.
 */
async function commitOrConflict(gh, changes, message) {
  try {
    return await gh.commit(message, changes);
  } catch (error) {
    if (error?.status === 422 || error?.status === 409) {
      return json(
        {
          ok: false,
          error:
            "Someone else saved a change a moment ago, so this one wasn't applied — " +
            "nothing was lost on their side or yours. Please reload the page and make your edit again.",
        },
        409,
      );
    }
    throw error;
  }
}

/**
 * Is this image path referenced by any entry other than the one being changed?
 * Checked across ALL collections, not just this one, because nothing stops a
 * partner logo and a member photo from pointing at the same file.
 */
function isImageUsedElsewhere(imagePath, content, ownFile, ownPrefix) {
  const ownPath = ownPrefix + ownFile;
  return Object.entries(content).some(
    ([path, data]) =>
      path !== ownPath &&
      [data.image, data.photo, data.logo].includes(imagePath),
  );
}

/**
 * The collection as it stands after this change, without asking GitHub again.
 *
 * WHY NOT JUST RE-READ. Because the answer comes back stale. GitHub serves the
 * tree-by-branch-name lookup from a cache for a short window, so a state call
 * issued immediately after a commit can return the previous contents — and the
 * board's experience of that is pressing Save, seeing "Changes saved", and then
 * looking at a list that still shows the old title. Measured, not theorised:
 * two entries deleted through this API were still listed by the read that
 * followed, and were correctly gone a few seconds later.
 *
 * The Worker does not need to ask. It knows what it wrote, and the commit
 * already succeeded, so the result is simply the entries it read at the start
 * with this one swapped in or taken out. That is also one fewer round trip.
 *
 * @param {{file: string, data: object}[]} siblings  the collection before the change
 * @param {string} file
 * @param {object | null} data  the new contents, or null if it was deleted
 */
function collectionAfter(siblings, file, data) {
  const rest = siblings.filter((s) => s.file !== file);
  if (data) rest.push({ file, data });
  return rest.sort((a, b) => a.file.localeCompare(b.file));
}

/**
 * What actually gets written, given the validated entry.
 *
 * Two things are happening here, and both are about keeping the committed file
 * clean rather than merely valid.
 *
 * KEY ORDER comes from the schema, because Zod returns its output in the order
 * the shape declares — which is exactly the order every hand-authored file in
 * content/ already uses (id, title, date, time, location, description, image,
 * rsvpUrl, i18n). Taking it from the schema rather than from the form's field
 * order means a save shows up in `git diff` as the lines that changed, instead
 * of a whole-file reshuffle nobody can review.
 *
 * PHANTOM KEYS are dropped. `optional()` in schema.js normalizes a missing value
 * to null, so Zod's output carries `"id": null` and `"i18n": null` for a brand
 * new event that has neither. They are harmless to the build and still wrong to
 * write: an `id` key contradicts the rule that the filename is the id, and an
 * `i18n: null` in a fresh file is noise in every future diff. So anything the
 * form did not supply and the previous file did not carry is left out.
 */
function toFile(validated, submitted) {
  const out = {};
  for (const [key, value] of Object.entries(validated)) {
    if (key in submitted) out[key] = value;
  }
  return out;
}

/** The first validation problem, phrased with the label the board saw on the form. */
function firstProblem(collection, result) {
  const issue = result.error.issues[0];
  const key = issue.path[0];
  const field = collection.fields.find((f) => f.name === key);
  const label = field?.label ?? (key === collection.imageField ? collection.imageLabel : String(key));
  // Schema messages are written to read after a field name ("is required",
  // "must be a full URL"), so this reads as a sentence either way.
  return `${label}: ${issue.message}`;
}

function firstField(result) {
  return String(result.error.issues[0]?.path[0] ?? "");
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
