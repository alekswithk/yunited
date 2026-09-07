// The inline copy editor's server side.
//
//   POST /admin/api/copy  { edits: [{ key, value }] }
//     Change one or more editable UI strings in src/i18n/en.json AND regenerate
//     hr/bs/sr for those keys, all in ONE commit. FAIL-LOUD: if any locale fails
//     its gate, or DeepL fails, nothing is committed and the board is told why.
//     German is never regenerated (hand-reviewed, indexed) — each edited key is
//     added to a review list the /admin Translations tab surfaces.
//
//   POST /admin/api/copy  { reviewed: [key] }   drop keys off that review list.
//   GET  /admin/api/copy?keys=a,b                { en: { a: "…" } } for the editor.
//
// The write routes are already gated in index.js handle() (same-origin Origin +
// board membership). This adds the per-key allow-list (src/lib/copy/editable.js,
// shared with the component and check-dist) and the DeepL fan-out (the same
// isomorphic src/lib/translate primitives worker/translate.js uses for events).

import { github } from "./github.js";
import { identity } from "./access.js";
import { resolveKey, describeDeeplError, NO_DEEPL_KEY, SAVE_BUDGET_MS } from "./translate.js";
import { translateSetComplete } from "../src/lib/translate/deepl.js";
import { checkString, errorsOf } from "../src/lib/translate/validate.js";
import { flatten, unflatten } from "../src/lib/translate/flat.js";
import { isEditableCopyKey } from "../src/lib/copy/editable.js";
import { NOTES } from "../src/lib/translate/notes.js";

const REGEN = ["hr", "bs", "sr"]; // de is deliberately absent
const ALL = ["en", ...REGEN];
const LANG_NAME = { hr: "Croatian", bs: "Bosnian", sr: "Serbian" };
const pathFor = (code) => `src/i18n/${code}.json`;

const REVIEW_KEY = "copy-de-review";
const KILL_KEY = "edit-mode";
const MAX_EDITS = 25;

const CONCURRENT_SAVE =
  "Someone else saved a change a moment ago, so this one wasn't applied — nothing was " +
  "lost on their side or yours. Reload the page and make your edit again.";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** Serialize a dictionary the way scripts/translate.mjs does: en's key order, trailing \n. */
const serialize = (flat, enFlat) => JSON.stringify(unflatten(flat, enFlat), null, 2) + "\n";

/** Inline edit mode is on unless ADMIN_SETTINGS holds edit-mode = "off". */
export async function editModeEnabled(env) {
  if (!env.ADMIN_SETTINGS) return true;
  try {
    return (await env.ADMIN_SETTINGS.get(KILL_KEY, { cacheTtl: 60 })) !== "off";
  } catch {
    return true; // a KV blip must never disable the editor
  }
}

/** English keys edited since German was last reviewed: [{ key, en, at, by }]. */
export async function deReviewList(env) {
  if (!env.ADMIN_SETTINGS) return [];
  try {
    return (await env.ADMIN_SETTINGS.get(REVIEW_KEY, { type: "json", cacheTtl: 60 })) ?? [];
  } catch {
    return [];
  }
}

async function writeReview(env, list) {
  if (!env.ADMIN_SETTINGS) return;
  if (list.length) await env.ADMIN_SETTINGS.put(REVIEW_KEY, JSON.stringify(list));
  else await env.ADMIN_SETTINGS.delete(REVIEW_KEY);
}

function mergeReview(existing, changed, enFlat, actor) {
  const byKey = new Map(existing.map((row) => [row.key, row]));
  const now = new Date().toISOString();
  for (const { key, value } of changed) {
    byKey.set(key, { key, en: value ?? enFlat[key], at: now, by: actor ?? null });
  }
  return [...byKey.values()];
}

function deeplReason(error) {
  if (error?.name === "AbortError") return "timeout";
  if (error?.status === 403 || error?.status === 401) return "rejected";
  if (error?.status === 429) return "rate-limited";
  if (error?.status === 456) return "quota";
  return "upstream";
}

// --- GET -------------------------------------------------------------------

export async function getCopy(request, env, { gh = github(env) } = {}) {
  const keys = (new URL(request.url).searchParams.get("keys") ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  if (!keys.length) return json({ ok: false, error: "Ask for at least one key." }, 400);

  const { files } = await gh.readFilesAtHead([pathFor("en")]);
  const en = flatten(JSON.parse(files[pathFor("en")]));

  const out = {};
  for (const key of keys) if (isEditableCopyKey(key, en[key])) out[key] = en[key];
  return json({ ok: true, en: out });
}

// --- POST ----------------------------------------------------------------

export async function postCopy(request, env, { gh = github(env), fetchImpl } = {}) {
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    return json({ ok: false, error: "Send this as application/json." }, 415);
  }
  if (!(await editModeEnabled(env))) {
    return json({ ok: false, error: "Inline editing is turned off in this deployment." }, 403);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "That wasn't valid JSON." }, 400);
  }

  // Mode 2 — mark some German keys reviewed (no edits).
  if (Array.isArray(body?.reviewed) && !Array.isArray(body?.edits)) {
    const remaining = (await deReviewList(env)).filter((row) => !body.reviewed.includes(row.key));
    await writeReview(env, remaining);
    return json({ ok: true, deReview: remaining });
  }

  const edits = Array.isArray(body?.edits) ? body.edits : [];
  if (!edits.length) return json({ ok: false, error: "No edits to save." }, 400);
  if (edits.length > MAX_EDITS) {
    return json({ ok: false, error: `Save at most ${MAX_EDITS} edits at once.` }, 400);
  }

  const actor = identity(request).email;
  const { files, headSha } = await gh.readFilesAtHead(ALL.map(pathFor));
  const dict = Object.fromEntries(ALL.map((code) => [code, JSON.parse(files[pathFor(code)])]));
  const enFlat = flatten(dict.en);

  // 1. Allow-list: the existing key must be editable AND so must the new value.
  const clean = [];
  for (const edit of edits) {
    const key = typeof edit?.key === "string" ? edit.key : "";
    const value = typeof edit?.value === "string" ? edit.value.trim() : "";
    if (!isEditableCopyKey(key, enFlat[key])) {
      return json({ ok: false, error: `“${key}” is not an editable text on the site.`, key }, 400);
    }
    if (!isEditableCopyKey(key, value)) {
      return json(
        {
          ok: false,
          key,
          error: `That text can't be used for “${key}” — plain sentences only, no markup, links or {slots}.`,
        },
        400,
      );
    }
    clean.push({ key, value });
  }

  const changed = clean.filter((e) => e.value !== enFlat[e.key]);
  if (!changed.length) {
    return json({ ok: true, message: "No change — the text already reads that way.", deReview: await deReviewList(env) });
  }

  // 2. Regenerate hr/bs/sr for the changed keys. Any failure aborts the save.
  const resolved = await resolveKey(env);
  if (!resolved) return json({ ok: false, reason: "no-key", error: NO_DEEPL_KEY }, 503);

  const items = changed.map(({ key, value }) => ({ key, source: value, note: NOTES[key] }));
  const controller = new AbortController();
  const alarm = setTimeout(() => controller.abort(), SAVE_BUDGET_MS);
  const regen = {};
  try {
    for (const code of REGEN) {
      const { values } = await translateSetComplete({
        items,
        code,
        apiKey: resolved.key,
        sourceLang: "en",
        fetchImpl,
        signal: controller.signal,
        onNote: (m) => console.warn(`[copy] ${m}`),
      });
      for (const { key, value } of changed) {
        const errs = errorsOf(checkString(value, values[key], key, code));
        if (errs.length) {
          return json(
            {
              ok: false,
              reason: "validation",
              key,
              error:
                `The ${LANG_NAME[code]} translation of “${key}” did not pass review ` +
                `(${errs[0].message}). Nothing was saved — reword the English and try again.`,
            },
            422,
          );
        }
      }
      regen[code] = values;
    }
  } catch (error) {
    return json(
      { ok: false, reason: deeplReason(error), error: describeDeeplError(error) },
      502,
    );
  } finally {
    clearTimeout(alarm);
  }

  // 3. Apply and commit — one commit, refused if the branch moved since step 0.
  const nextEn = { ...enFlat };
  for (const { key, value } of changed) nextEn[key] = value;
  const changes = [{ path: pathFor("en"), content: serialize(nextEn, enFlat) }];
  for (const code of REGEN) {
    const flat = flatten(dict[code]);
    for (const { key } of changed) flat[key] = regen[code][key];
    changes.push({ path: pathFor(code), content: serialize(flat, enFlat) });
  }

  const summary = changed.map((e) => e.key).join(", ");
  let commit;
  try {
    commit = await gh.commit(
      `content: edit copy — ${summary}\n\nSaved from the inline editor by ${actor ?? "unknown"}.`,
      changes,
      { expectedHeadSha: headSha },
    );
  } catch (error) {
    if (error?.status === 409 || error?.status === 422) {
      return json({ ok: false, error: CONCURRENT_SAVE }, 409);
    }
    throw error;
  }

  // 4. German is now stale for these keys — record it for the Translations tab.
  const review = mergeReview(await deReviewList(env), changed, enFlat, actor);
  await writeReview(env, review);

  console.log(`[admin] copy edited (${summary}) — by ${actor ?? "unknown"}`);
  return json({
    ok: true,
    message: "Saved. Live on the site in a minute or two.",
    commit: { sha: commit.sha, url: commit.url },
    deReview: review,
  });
}
