// The inline copy editor's server side.
//
// The failures that matter here are invisible to build/check/check:dist: a save
// that succeeds is a repo commit, so "commits hr.json as a one-key file",
// "commits stale English over a concurrent edit", or "ships an un-gated
// translation" would all pass every other command. Driven with fakes — no
// network, no KV, no GitHub.

import test from "node:test";
import assert from "node:assert/strict";

import { postCopy, getCopy } from "./copy.js";

// --- fakes ---------------------------------------------------------------

const EN = { about: { missionP1: "Old mission.", heroLede: "Old lede." }, home: { whoBody: "Old who." }, nav: { events: "Events" } };
const stale = (tag) => ({ about: { missionP1: `${tag} mission`, heroLede: `${tag} lede` }, home: { whoBody: `${tag} who` }, nav: { events: `${tag} events` } });

function fakeGh({ moved = false } = {}) {
  const files = {};
  for (const [code, obj] of Object.entries({ en: EN, hr: stale("HR"), bs: stale("BS"), sr: stale("SR") })) {
    files[`src/i18n/${code}.json`] = JSON.stringify(obj, null, 2) + "\n";
  }
  const commits = [];
  return {
    commits,
    async readFilesAtHead(paths) {
      const out = {};
      for (const p of paths) {
        if (!(p in files)) throw Object.assign(new Error("404"), { status: 404 });
        out[p] = files[p];
      }
      return { files: out, headSha: "HEAD1" };
    },
    async commit(message, changes, opts) {
      if (moved) throw Object.assign(new Error("branch moved"), { status: 409 });
      commits.push({ message, changes, opts });
      return { sha: "NEWSHA", url: "https://github.com/x/y/commit/NEWSHA" };
    },
  };
}

function fakeKV(init = {}) {
  const store = new Map(Object.entries(init).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));
  return {
    store,
    async get(k, opts) {
      const v = store.get(k);
      if (v === undefined) return null;
      return opts?.type === "json" ? JSON.parse(v) : v;
    },
    async put(k, v) { store.set(k, v); },
    async delete(k) { store.delete(k); },
  };
}

// A DeepL stand-in. `translate(source, TARGET_LANG)` returns the string, or
// { status } to make the HTTP call fail.
const deepl = (translate = (s, lang) => `[${lang}] ${s}`) => async (_url, init) => {
  const { text, target_lang } = JSON.parse(init.body);
  const out = translate(text[0], target_lang);
  if (out && typeof out === "object" && "status" in out) {
    return { ok: false, status: out.status, statusText: "x", text: async () => "deepl error" };
  }
  return { ok: true, json: async () => ({ translations: [{ text: out, detected_source_language: "EN" }] }) };
};

const envWith = (over = {}) => ({ DEEPL_API_KEY: "test-key-aaaaaaaaaaaaaaaaaaaa", ADMIN_SETTINGS: fakeKV(), ...over });

const postReq = (body, headers = {}) =>
  new Request("https://yunited.ch/admin/api/copy", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-access-authenticated-user-email": "board@hsg.ch",
      ...headers,
    },
    body: JSON.stringify(body),
  });

// --- POST /admin/api/copy ---------------------------------------------------

test("rejects a key outside the allow-list, and commits nothing", async () => {
  const gh = fakeGh();
  const res = await postCopy(postReq({ edits: [{ key: "nav.events", value: "Programme" }] }), envWith(), { gh, fetchImpl: deepl() });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).key, "nav.events");
  assert.equal(gh.commits.length, 0);
});

test("rejects markup or an interpolation slot in the new value", async () => {
  const gh = fakeGh();
  for (const value of ["<strong>hi</strong>", "welcome {name}", "see <a href=/x>here</a>"]) {
    const res = await postCopy(postReq({ edits: [{ key: "about.missionP1", value }] }), envWith(), { gh, fetchImpl: deepl() });
    assert.equal(res.status, 400, value);
  }
  assert.equal(gh.commits.length, 0);
});

test("happy path: one commit of en + hr/bs/sr (never de), review list recorded", async () => {
  const gh = fakeGh();
  const env = envWith();
  const res = await postCopy(
    postReq({ edits: [{ key: "about.missionP1", value: "A new mission statement." }] }),
    env,
    { gh, fetchImpl: deepl() },
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.commit.sha, "NEWSHA");

  assert.equal(gh.commits.length, 1);
  const paths = gh.commits[0].changes.map((c) => c.path).sort();
  assert.deepEqual(paths, ["src/i18n/bs.json", "src/i18n/en.json", "src/i18n/hr.json", "src/i18n/sr.json"]);
  assert.equal(gh.commits[0].opts.expectedHeadSha, "HEAD1");

  const en = JSON.parse(gh.commits[0].changes.find((c) => c.path === "src/i18n/en.json").content);
  assert.equal(en.about.missionP1, "A new mission statement.");
  assert.equal(en.about.heroLede, "Old lede."); // untouched key preserved
  const hr = JSON.parse(gh.commits[0].changes.find((c) => c.path === "src/i18n/hr.json").content);
  assert.equal(hr.about.missionP1, "[HR] A new mission statement.");
  assert.equal(hr.about.heroLede, "HR lede"); // untouched translation preserved

  assert.deepEqual(body.deReview.map((r) => r.key), ["about.missionP1"]);
  assert.equal(JSON.parse(env.ADMIN_SETTINGS.store.get("copy-de-review"))[0].key, "about.missionP1");
});

test("a gate failure in one locale aborts the whole save", async () => {
  const gh = fakeGh();
  // Serbian comes back empty -> checkString: "translation is empty"
  const fetchImpl = deepl((s, lang) => (lang === "SR" ? "" : `[${lang}] ${s}`));
  const res = await postCopy(postReq({ edits: [{ key: "home.whoBody", value: "Fresh copy here." }] }), envWith(), { gh, fetchImpl });
  assert.equal(res.status, 422);
  assert.equal((await res.json()).reason, "validation");
  assert.equal(gh.commits.length, 0);
});

test("a DeepL HTTP failure aborts the save with a reason", async () => {
  const gh = fakeGh();
  const fetchImpl = deepl(() => ({ status: 429 }));
  const res = await postCopy(postReq({ edits: [{ key: "home.whoBody", value: "Fresh copy here." }] }), envWith(), { gh, fetchImpl });
  assert.equal(res.status, 502);
  assert.equal((await res.json()).reason, "rate-limited");
  assert.equal(gh.commits.length, 0);
});

test("no DeepL key: 503, nothing committed", async () => {
  const gh = fakeGh();
  const res = await postCopy(
    postReq({ edits: [{ key: "home.whoBody", value: "Fresh copy here." }] }),
    envWith({ DEEPL_API_KEY: undefined }),
    { gh, fetchImpl: deepl() },
  );
  assert.equal(res.status, 503);
  assert.equal((await res.json()).reason, "no-key");
  assert.equal(gh.commits.length, 0);
});

test("branch moved between read and commit: 409", async () => {
  const gh = fakeGh({ moved: true });
  const res = await postCopy(postReq({ edits: [{ key: "about.missionP1", value: "Something new entirely." }] }), envWith(), { gh, fetchImpl: deepl() });
  assert.equal(res.status, 409);
});

test("a no-op edit commits nothing", async () => {
  const gh = fakeGh();
  const res = await postCopy(postReq({ edits: [{ key: "about.missionP1", value: "Old mission." }] }), envWith(), { gh, fetchImpl: deepl() });
  assert.equal(res.status, 200);
  assert.match((await res.json()).message, /No change/);
  assert.equal(gh.commits.length, 0);
});

test("{ reviewed: [...] } prunes the German review list", async () => {
  const env = envWith({
    ADMIN_SETTINGS: fakeKV({ "copy-de-review": [{ key: "about.missionP1", en: "x" }, { key: "home.whoBody", en: "y" }] }),
  });
  const res = await postCopy(postReq({ reviewed: ["about.missionP1"] }), env, { gh: fakeGh(), fetchImpl: deepl() });
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).deReview.map((r) => r.key), ["home.whoBody"]);
});

test("kill switch: edit-mode = off -> 403", async () => {
  const env = envWith({ ADMIN_SETTINGS: fakeKV({ "edit-mode": "off" }) });
  const res = await postCopy(postReq({ edits: [{ key: "about.missionP1", value: "x y z" }] }), env, { gh: fakeGh(), fetchImpl: deepl() });
  assert.equal(res.status, 403);
});

test("non-JSON content type -> 415", async () => {
  const res = await postCopy(
    postReq({ edits: [] }, { "content-type": "multipart/form-data" }),
    envWith(),
    { gh: fakeGh(), fetchImpl: deepl() },
  );
  assert.equal(res.status, 415);
});

// --- GET /admin/api/copy --------------------------------------------------

test("GET returns English source for editable keys only", async () => {
  const req = new Request("https://yunited.ch/admin/api/copy?keys=about.missionP1,nav.events,home.whoBody");
  const res = await getCopy(req, envWith(), { gh: fakeGh() });
  assert.deepEqual(await res.json(), {
    ok: true,
    en: { "about.missionP1": "Old mission.", "home.whoBody": "Old who." },
  });
});

test("GET with no keys -> 400", async () => {
  const res = await getCopy(new Request("https://yunited.ch/admin/api/copy"), envWith(), { gh: fakeGh() });
  assert.equal(res.status, 400);
});
