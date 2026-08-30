import { test } from "node:test";
import assert from "node:assert/strict";

import { handleBuddyPublic, handleBuddyAdmin, purgeStaleBuddySignups } from "./buddy.js";

// --- an in-memory stand-in for worker/buddy-store.js ------------------------
// Rows use the D1 column shape (snake_case) the handlers read.

function fakeStore(seed = {}) {
  const signups = [...(seed.signups ?? [])];
  const rounds = [...(seed.rounds ?? [])];
  const pairs = [...(seed.pairs ?? [])];

  return {
    _signups: signups,
    _rounds: rounds,
    _pairs: pairs,

    async findActiveByEmail(email) {
      return (
        signups.find(
          (s) => s.email === email && ["pending", "active", "matched"].includes(s.status),
        ) ?? null
      );
    },
    async insertSignup(row) {
      signups.push({
        id: row.id,
        role: row.role,
        name: row.name,
        email: row.email,
        email_verified: 0,
        verify_token: row.verifyToken,
        manage_token: row.manageToken,
        audience: row.audience,
        study_level: row.studyLevel,
        languages: row.languages,
        note: row.note,
        capacity: row.capacity,
        open_to_extra: row.openToExtra ? 1 : 0,
        is_member: row.isMember ? 1 : 0,
        locale: row.locale,
        status: "pending",
        round_id: null,
        created_at: row.now,
        updated_at: row.now,
      });
    },
    async refreshPending(id, token) {
      signups.find((s) => s.id === id).verify_token = token;
    },
    async findByVerifyToken(token) {
      return signups.find((s) => s.verify_token === token) ?? null;
    },
    async markVerified(id) {
      const s = signups.find((r) => r.id === id);
      s.email_verified = 1;
      s.status = "active";
      s.verify_token = null;
    },
    async findByManageToken(token) {
      return signups.find((s) => s.manage_token === token) ?? null;
    },
    async withdraw(id) {
      signups.find((s) => s.id === id).status = "withdrawn";
    },
    async activeBuddies() {
      return signups.filter((s) => s.role === "buddy" && s.status === "active" && s.email_verified);
    },
    async unmatchedSeekers() {
      return signups.filter((s) => s.role === "seeker" && s.status === "active" && s.email_verified);
    },
    async createRound(r) {
      rounds.push({ id: r.id, seed: r.seed, created_at: r.now, created_by: r.by, notified_at: null });
    },
    async insertPairs(list) {
      for (const p of list) {
        pairs.push({
          id: p.id,
          round_id: p.roundId,
          buddy_id: p.buddyId,
          seeker_id: p.seekerId,
          buddy_token: p.buddyToken,
          seeker_token: p.seekerToken,
          basis: p.basis,
          buddy_confirmed: 0,
          seeker_confirmed: 0,
          flagged: 0,
          created_at: p.now,
        });
      }
    },
    async assignRound(ids, roundId) {
      for (const id of new Set(ids)) {
        const s = signups.find((r) => r.id === id);
        if (s) {
          s.status = "matched";
          s.round_id = roundId;
        }
      }
    },
    async findPairByToken(token) {
      return pairs.find((p) => p.buddy_token === token || p.seeker_token === token) ?? null;
    },
    async signupById(id) {
      return signups.find((s) => s.id === id) ?? null;
    },
    async setPairConfirmed(id, side) {
      const p = pairs.find((r) => r.id === id);
      if (side === "buddy") p.buddy_confirmed = 1;
      else p.seeker_confirmed = 1;
    },
    async flagPair(id) {
      pairs.find((p) => p.id === id).flagged = 1;
    },
    async lastRound() {
      return rounds[rounds.length - 1] ?? null;
    },
    async roundById(id) {
      return rounds.find((r) => r.id === id) ?? null;
    },
    async roundPairs(roundId) {
      return pairs.filter((p) => p.round_id === roundId);
    },
    async markRoundNotified(roundId, now) {
      rounds.find((r) => r.id === roundId).notified_at = now;
    },
    async counts() {
      return {
        buddies: signups.filter((s) => s.role === "buddy" && s.status === "active").length,
        seekers: signups.filter((s) => s.role === "seeker" && s.status === "active").length,
        pending: signups.filter((s) => s.status === "pending").length,
        matched: signups.filter((s) => s.status === "matched").length,
        capacity: signups
          .filter((s) => s.role === "buddy" && s.status === "active")
          .reduce((n, s) => n + s.capacity + s.open_to_extra, 0),
      };
    },
    async allSignups() {
      return signups;
    },
    async pendingSignups() {
      return signups.filter((s) => s.status === "pending");
    },
    async removeSignup(id) {
      const i = signups.findIndex((s) => s.id === id);
      if (i >= 0) signups.splice(i, 1);
    },
    async purgeStalePending(cutoff) {
      const before = signups.length;
      for (let i = signups.length - 1; i >= 0; i--) {
        if (signups[i].status === "pending" && signups[i].created_at < cutoff) signups.splice(i, 1);
      }
      return before - signups.length;
    },
  };
}

function fakeSend() {
  const calls = [];
  return {
    calls,
    fn: async (_env, msg) => {
      calls.push(msg);
      return { ok: true, id: `m${calls.length}` };
    },
  };
}

const NOW = () => "2026-09-01T10:00:00.000Z";
const req = (method, body, json = true) =>
  new Request("https://yunited.ch/x", {
    method,
    headers: json ? { "Content-Type": "application/json", Accept: "application/json" } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const url = (path) => new URL(`https://yunited.ch${path}`);

const goodSignup = {
  role: "seeker",
  name: "Mara",
  email: "mara@student.unisg.ch",
  audience: "hsg",
  studyLevel: "assessment",
  consent: "on",
  locale: "hr",
};

// --- public: signup ------------------------------------------------------

test("signup writes a pending row and sends a verify email in the signer's language", async () => {
  const store = fakeStore();
  const send = fakeSend();
  const res = await handleBuddyPublic(req("POST", goodSignup), {}, url("/buddy/api/signup"), {
    store,
    sendEmail: send.fn,
    now: NOW,
    origin: "https://yunited.ch",
  });
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(store._signups.length, 1);
  assert.equal(store._signups[0].status, "pending");
  assert.equal(store._signups[0].email_verified, 0);
  assert.equal(send.calls.length, 1);
  assert.equal(send.calls[0].to, "mara@student.unisg.ch");
  assert.match(send.calls[0].subject, /kumstva/); // hr
  assert.match(send.calls[0].text, /buddy\/api\/verify\?token=/);
});

test("the honeypot field is accepted silently and writes nothing", async () => {
  const store = fakeStore();
  const send = fakeSend();
  const res = await handleBuddyPublic(
    req("POST", { ...goodSignup, website: "http://spam" }),
    {},
    url("/buddy/api/signup"),
    { store, sendEmail: send.fn, now: NOW },
  );
  assert.equal((await res.json()).ok, true);
  assert.equal(store._signups.length, 0);
  assert.equal(send.calls.length, 0);
});

test("a bad signup is rejected with the field name", async () => {
  const store = fakeStore();
  const res = await handleBuddyPublic(
    req("POST", { ...goodSignup, email: "nope" }),
    {},
    url("/buddy/api/signup"),
    { store, sendEmail: fakeSend().fn, now: NOW },
  );
  assert.equal(res.status, 400);
  assert.equal((await res.json()).field, "email");
});

test("signup skips Turnstile when TURNSTILE_SECRET_KEY is absent", async () => {
  const store = fakeStore();
  const vt = async () => { throw new Error("should not be called"); };
  const res = await handleBuddyPublic(req("POST", goodSignup), {}, url("/buddy/api/signup"), {
    store,
    sendEmail: fakeSend().fn,
    now: NOW,
    verifyTurnstile: vt,
  });
  // No secret in env → skip check → row written
  assert.equal((await res.json()).ok, true);
  assert.equal(store._signups.length, 1);
});

test("signup passes when Turnstile verifies successfully", async () => {
  const store = fakeStore();
  const res = await handleBuddyPublic(
    req("POST", { ...goodSignup, "cf-turnstile-response": "valid-token" }),
    { TURNSTILE_SECRET_KEY: "secret" },
    url("/buddy/api/signup"),
    { store, sendEmail: fakeSend().fn, now: NOW, verifyTurnstile: async () => true },
  );
  assert.equal((await res.json()).ok, true);
  assert.equal(store._signups.length, 1);
});

test("signup is rejected with 400 when Turnstile verification fails", async () => {
  const store = fakeStore();
  const res = await handleBuddyPublic(
    req("POST", { ...goodSignup, "cf-turnstile-response": "bad-token" }),
    { TURNSTILE_SECRET_KEY: "secret" },
    url("/buddy/api/signup"),
    { store, sendEmail: fakeSend().fn, now: NOW, verifyTurnstile: async () => false },
  );
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.equal(body.field, "turnstile");
  assert.equal(store._signups.length, 0);
});

test("signing up again while still pending reissues the link, not a second row", async () => {
  const store = fakeStore();
  const send = fakeSend();
  const opts = { store, sendEmail: send.fn, now: NOW, origin: "https://yunited.ch" };
  await handleBuddyPublic(req("POST", goodSignup), {}, url("/buddy/api/signup"), opts);
  const firstToken = store._signups[0].verify_token;
  await handleBuddyPublic(req("POST", goodSignup), {}, url("/buddy/api/signup"), opts);
  assert.equal(store._signups.length, 1);
  assert.notEqual(store._signups[0].verify_token, firstToken);
  assert.equal(send.calls.length, 2);
});

test("a signup still succeeds when the mailer is down", async () => {
  const store = fakeStore();
  const res = await handleBuddyPublic(req("POST", goodSignup), {}, url("/buddy/api/signup"), {
    store,
    sendEmail: async () => {
      throw new Error("resend 500");
    },
    now: NOW,
  });
  // sendEmail is called by the handler; our fake throws — but buildEmail path is
  // guarded, so use the real emails.sendEmail contract: it never throws. Here we
  // simulate a mailer that does; the handler's try/catch keeps the row.
  assert.equal(res.status, 500);
  // The row was written before the throw.
  assert.equal(store._signups.length, 1);
});

// --- public: verify / withdraw ----------------------------------------

test("verify marks the row active and redirects to the localised confirmed page", async () => {
  const store = fakeStore({
    signups: [
      {
        id: "s1",
        role: "seeker",
        name: "Mara",
        email: "m@x.ch",
        email_verified: 0,
        verify_token: "tok_verify_0000000000000000",
        manage_token: "tok_manage_0000000000000000",
        audience: "hsg",
        study_level: "assessment",
        languages: "",
        note: "",
        capacity: 1,
        open_to_extra: 0,
        is_member: 0,
        locale: "de",
        status: "pending",
      },
    ],
  });
  const res = await handleBuddyPublic(
    new Request("https://yunited.ch/buddy/api/verify?token=tok_verify_0000000000000000"),
    {},
    url("/buddy/api/verify?token=tok_verify_0000000000000000"),
    { store, now: NOW },
  );
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("Location"), "/de/buddy/confirmed");
  assert.equal(store._signups[0].status, "active");
  assert.equal(store._signups[0].verify_token, null);
});

test("a bad verify token just redirects to /buddy, no error", async () => {
  const store = fakeStore();
  const res = await handleBuddyPublic(
    new Request("https://yunited.ch/buddy/api/verify?token=deadbeefdeadbeefdead"),
    {},
    url("/buddy/api/verify?token=deadbeefdeadbeefdead"),
    { store, now: NOW },
  );
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("Location"), "/buddy");
});

test("withdraw sets the row to withdrawn and lands on /buddy/removed", async () => {
  const store = fakeStore({
    signups: [
      {
        id: "s1",
        name: "Mara",
        email: "m@x.ch",
        manage_token: "tok_manage_1111111111111111",
        locale: "en",
        status: "active",
        role: "seeker",
        email_verified: 1,
      },
    ],
  });
  const res = await handleBuddyPublic(
    new Request("https://yunited.ch/buddy/api/withdraw?token=tok_manage_1111111111111111"),
    {},
    url("/buddy/api/withdraw?token=tok_manage_1111111111111111"),
    { store, now: NOW },
  );
  assert.equal(res.headers.get("Location"), "/buddy/removed");
  assert.equal(store._signups[0].status, "withdrawn");
});

// --- admin: a full round ---------------------------------------------

function verifiedPool() {
  const mk = (id, role, extra = {}) => ({
    id,
    role,
    name: id.toUpperCase(),
    email: `${id}@x.ch`,
    email_verified: 1,
    status: "active",
    audience: "hsg",
    study_level: "bachelor",
    languages: "BCS",
    note: "",
    capacity: 1,
    open_to_extra: 0,
    is_member: 1,
    locale: "en",
    manage_token: `tok_manage_${id}00000000000000`,
    ...extra,
  });
  return fakeStore({
    signups: [
      mk("b1", "buddy", { capacity: 1, open_to_extra: 1 }),
      mk("b2", "buddy", { capacity: 2 }),
      mk("s1", "seeker"),
      mk("s2", "seeker"),
      mk("s3", "seeker"),
    ],
  });
}

test("preview proposes a full pairing without writing anything", async () => {
  const store = verifiedPool();
  const res = await handleBuddyAdmin("round/preview", req("POST", {}), {}, { store, now: NOW });
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.pairs.length, 3);
  assert.equal(body.unmatched.length, 0);
  assert.ok(Number.isFinite(body.seed));
  assert.equal(store._rounds.length, 0);
  assert.equal(store._pairs.length, 0);
});

test("commit persists the round + pairs and marks people matched; notify emails everyone", async () => {
  const store = verifiedPool();
  const send = fakeSend();
  const opts = { store, sendEmail: send.fn, now: NOW, origin: "https://yunited.ch", actor: "board@x.ch" };

  const preview = await (await handleBuddyAdmin("round/preview", req("POST", {}), {}, opts)).json();
  const commit = await (
    await handleBuddyAdmin("round/commit", req("POST", { seed: preview.seed }), {}, opts)
  ).json();
  assert.equal(commit.ok, true);
  assert.equal(commit.pairs, 3);
  assert.equal(store._rounds.length, 1);
  assert.equal(store._rounds[0].created_by, "board@x.ch");
  assert.equal(store._pairs.length, 3);
  assert.ok(store._signups.filter((s) => s.status === "matched").length >= 4);

  const notify = await (
    await handleBuddyAdmin("round/notify", req("POST", { roundId: commit.roundId }), {}, opts)
  ).json();
  assert.equal(notify.ok, true);
  assert.equal(notify.sent, 6); // 3 pairs × 2 people, all still 'matched' so no noMatch
  assert.equal(store._rounds[0].notified_at, NOW());
  // Each matched email carries that person's own pair-page token.
  assert.ok(send.calls.every((c) => /buddy\/pair\?t=/.test(c.text)));
});

test("notify with no roundId sends for the most recent round", async () => {
  const store = verifiedPool();
  const send = fakeSend();
  const opts = { store, sendEmail: send.fn, now: NOW, origin: "https://yunited.ch" };
  await handleBuddyAdmin("round/commit", req("POST", { seed: 3 }), {}, opts);

  const res = await (await handleBuddyAdmin("round/notify", req("POST", {}), {}, opts)).json();
  assert.equal(res.ok, true);
  assert.ok(res.sent > 0);
  assert.equal(store._rounds[0].notified_at, NOW());
});

test("notify is idempotent — a second send is a no-op, not a re-send", async () => {
  const store = verifiedPool();
  const send = fakeSend();
  const opts = { store, sendEmail: send.fn, now: NOW, origin: "https://yunited.ch" };
  await handleBuddyAdmin("round/commit", req("POST", { seed: 3 }), {}, opts);
  await handleBuddyAdmin("round/notify", req("POST", {}), {}, opts);
  const before = send.calls.length;

  const again = await (await handleBuddyAdmin("round/notify", req("POST", {}), {}, opts)).json();
  assert.equal(again.ok, true);
  assert.equal(again.alreadyNotified, true);
  assert.equal(send.calls.length, before, "no extra emails on the second call");
});

test("notify with no round at all is a clean 404", async () => {
  const res = await handleBuddyAdmin("round/notify", req("POST", {}), {}, { store: verifiedPool(), now: NOW });
  assert.equal(res.status, 404);
});

test("commit is deterministic for a given seed", async () => {
  const a = await (
    await handleBuddyAdmin("round/commit", req("POST", { seed: 4242 }), {}, { store: verifiedPool(), now: NOW })
  ).json();
  const b = await (
    await handleBuddyAdmin("round/commit", req("POST", { seed: 4242 }), {}, { store: verifiedPool(), now: NOW })
  ).json();
  assert.equal(a.pairs, b.pairs);
  assert.equal(a.unmatched, b.unmatched);
});

test("notify also sends a 'no match' note to a seeker left in the pool", async () => {
  // No buddy opted for extra, so capacity is a hard 1 + 2 = 3 against 5 seekers.
  const mk = (id, role, extra = {}) => ({
    id,
    role,
    name: id.toUpperCase(),
    email: `${id}@x.ch`,
    email_verified: 1,
    status: "active",
    audience: "hsg",
    study_level: "bachelor",
    languages: "",
    note: "",
    capacity: 1,
    open_to_extra: 0,
    is_member: 1,
    locale: "en",
    manage_token: `tok_manage_${id}00000000000000`,
    ...extra,
  });
  const store = fakeStore({
    signups: [
      mk("b1", "buddy", { capacity: 1 }),
      mk("b2", "buddy", { capacity: 2 }),
      mk("s1", "seeker"),
      mk("s2", "seeker"),
      mk("s3", "seeker"),
      mk("s4", "seeker"),
      mk("s5", "seeker"),
    ],
  });
  const send = fakeSend();
  const opts = { store, sendEmail: send.fn, now: NOW, origin: "https://yunited.ch" };
  const commit = await (
    await handleBuddyAdmin("round/commit", req("POST", { seed: 1 }), {}, opts)
  ).json();
  assert.equal(commit.unmatched, 2);
  await handleBuddyAdmin("round/notify", req("POST", { roundId: commit.roundId }), {}, opts);
  assert.equal(send.calls.filter((c) => /No match this round/.test(c.subject)).length, 2);
});

// --- public: pair page ------------------------------------------------

test("the pair endpoint returns each side's own view, keyed by token", async () => {
  const store = verifiedPool();
  const opts = { store, sendEmail: fakeSend().fn, now: NOW, origin: "https://yunited.ch" };
  await handleBuddyAdmin("round/commit", req("POST", { seed: 99 }), {}, opts);
  const pair = store._pairs[0];

  const asBuddy = await (
    await handleBuddyPublic(
      new Request(`https://yunited.ch/buddy/api/pair?t=${pair.buddy_token}`),
      {},
      url(`/buddy/api/pair?t=${pair.buddy_token}`),
      opts,
    )
  ).json();
  assert.equal(asBuddy.pair.youAre, "buddy");
  assert.equal(asBuddy.pair.partnerIsBuddy, false);

  const asSeeker = await (
    await handleBuddyPublic(
      new Request(`https://yunited.ch/buddy/api/pair?t=${pair.seeker_token}`),
      {},
      url(`/buddy/api/pair?t=${pair.seeker_token}`),
      opts,
    )
  ).json();
  assert.equal(asSeeker.pair.youAre, "seeker");
  assert.equal(asSeeker.pair.partner.name, asBuddy.pair.you.name);
});

test("pair confirm records the right side; flag notifies the board", async () => {
  const store = verifiedPool();
  const send = fakeSend();
  const opts = { store, sendEmail: send.fn, now: NOW, origin: "https://yunited.ch" };
  await handleBuddyAdmin("round/commit", req("POST", { seed: 7 }), {}, opts);
  const pair = store._pairs[0];

  await handleBuddyPublic(
    req("POST", { t: pair.seeker_token }),
    {},
    url("/buddy/api/pair/confirm"),
    opts,
  );
  assert.equal(store._pairs[0].seeker_confirmed, 1);
  assert.equal(store._pairs[0].buddy_confirmed, 0);

  send.calls.length = 0;
  await handleBuddyPublic(req("POST", { t: pair.buddy_token }), {}, url("/buddy/api/pair/flag"), opts);
  assert.equal(store._pairs[0].flagged, 1);
  assert.match(send.calls[0].subject, /flagged a problem/);
});

// --- admin: signup actions + export --------------------------------

test("admin can mark a pending signup confirmed and remove one", async () => {
  const store = fakeStore({
    signups: [
      { id: "p1", name: "Pat", email: "p@x.ch", role: "seeker", status: "pending", email_verified: 0, locale: "en" },
    ],
  });
  await handleBuddyAdmin("signup", req("POST", { id: "p1", action: "verify" }), {}, { store, now: NOW });
  assert.equal(store._signups[0].status, "active");
  await handleBuddyAdmin("signup", req("POST", { id: "p1", action: "remove" }), {}, { store, now: NOW });
  assert.equal(store._signups.length, 0);
});

test("state reports counts and the pending list", async () => {
  const store = verifiedPool();
  store._signups.push({ id: "p9", name: "Pend", email: "p9@x.ch", role: "buddy", status: "pending", email_verified: 0, created_at: "2026-08-01", audience: "hsg", capacity: 1, open_to_extra: 0 });
  const body = await (await handleBuddyAdmin("state", req("GET"), {}, { store, now: NOW })).json();
  assert.equal(body.counts.buddies, 2);
  assert.equal(body.counts.seekers, 3);
  assert.equal(body.pending.length, 1);
  assert.equal(body.pending[0].name, "Pend");
});

test("export.csv has a header and one row per signup", async () => {
  const store = verifiedPool();
  const res = await handleBuddyAdmin("export.csv", req("GET"), {}, { store, now: NOW });
  assert.match(res.headers.get("Content-Type"), /text\/csv/);
  const text = await res.text();
  const lines = text.trim().split("\n");
  assert.match(lines[0], /^name,email,role/);
  assert.equal(lines.length, 1 + store._signups.length);
});

// --- retention sweep -----------------------------------------------

test("purgeStaleBuddySignups drops only old pending rows", async () => {
  const store = fakeStore({
    signups: [
      { id: "old", status: "pending", created_at: "2026-01-01T00:00:00.000Z" },
      { id: "fresh", status: "pending", created_at: "2026-08-30T00:00:00.000Z" },
      { id: "active", status: "active", created_at: "2026-01-01T00:00:00.000Z" },
    ],
  });
  await purgeStaleBuddySignups({ BUDDY_DB: {} }, { store, now: () => "2026-09-01T00:00:00.000Z" });
  assert.deepEqual(store._signups.map((s) => s.id).sort(), ["active", "fresh"]);
});
