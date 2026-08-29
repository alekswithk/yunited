// The buddy system's request handlers.
//
// Two entry points:
//   * handleBuddyPublic  — /buddy/api/*  — NO Cloudflare Access in front. The
//     token in each URL is the only credential; every token is random, stored
//     next to the row it unlocks, and looked up on use.
//   * handleBuddyAdmin   — /admin/api/buddy/* — reached only after
//     worker/index.js has verified the board's Access token.
//
// The data-access layer is injected (`deps.store`), so these functions are
// unit-tested against an in-memory fake in worker/buddy.test.js. `now`, the
// mailer and the origin are injected for the same reason — the pattern the rest
// of worker/ already uses.
//
// A mail failure never fails a signup or a round: sendEmail returns a status, it
// does not throw, and the row / the pairing is already written by the time we
// try to send.
import { buddyStore } from "./buddy-store.js";
import { parseSignup, firstSignupProblem } from "../src/lib/buddy/schema.js";
import { planMatches, makeSeed } from "../src/lib/buddy/match.js";
import { randomToken, isToken } from "../src/lib/buddy/tokens.js";
import { buildEmail, sendEmail } from "../src/lib/buddy/emails.js";

const PENDING_TTL_DAYS = 14;

// --- shared helpers --------------------------------------------------------

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function redirect(location) {
  return new Response(null, { status: 302, headers: { Location: location, "Cache-Control": "no-store" } });
}

/** "/buddy/confirmed" for en, "/de/buddy/confirmed" for de. */
function localePath(locale, path) {
  return locale && locale !== "en" ? `/${locale}${path}` : path;
}

function wantsJson(request) {
  return (request.headers.get("Accept") || "").includes("application/json");
}

/** Body as a plain object, whether it arrived as JSON or a form POST. */
async function readBody(request) {
  const type = request.headers.get("Content-Type") || "";
  if (type.includes("application/json")) {
    return (await request.json().catch(() => ({}))) || {};
  }
  const form = await request.formData().catch(() => null);
  if (!form) return {};
  const out = {};
  for (const [k, v] of form.entries()) out[k] = typeof v === "string" ? v : "";
  return out;
}

function studyLabel(row) {
  const level = { assessment: "Assessment year", bachelor: "Bachelor", master: "Master", other: "" }[
    row.study_level
  ];
  const kind = row.audience === "exchange" ? "Exchange student" : "";
  return [level, kind].filter(Boolean).join(" · ");
}

// --- public: POST /buddy/api/signup -------------------------------------------

async function signup(request, env, { store, send, now, origin }) {
  const raw = await readBody(request);

  // Honeypot: a bot fills the hidden field. Answer as if it worked, write
  // nothing. Never a hint that it was caught.
  if (String(raw.website || "").trim() !== "") {
    return wantsJson(request)
      ? json({ ok: true })
      : redirect(localePath(guessLocale(raw.locale), "/buddy/check-email"));
  }

  const parsed = parseSignup(raw);
  if (!parsed.success) {
    const problem = firstSignupProblem(parsed);
    return json({ ok: false, error: problem.message, field: problem.field }, 400);
  }
  const data = parsed.data;
  const stamp = now();

  const existing = await store.findActiveByEmail(data.email);
  let verifyToken;
  let manageUrl;

  if (existing) {
    if (existing.email_verified) {
      // Already in the pool — say so plainly, do not leak more.
      return wantsJson(request)
        ? json({ ok: true, already: true })
        : redirect(localePath(data.locale, "/buddy/check-email"));
    }
    // Pending: reissue the confirmation link rather than a duplicate row.
    verifyToken = randomToken();
    await store.refreshPending(existing.id, verifyToken, stamp);
    manageUrl = `${origin}/buddy/api/withdraw?token=${existing.manage_token}`;
  } else {
    verifyToken = randomToken();
    const manageToken = randomToken();
    await store.insertSignup({
      id: crypto.randomUUID(),
      role: data.role,
      name: data.name,
      email: data.email,
      verifyToken,
      manageToken,
      audience: data.audience,
      studyLevel: data.studyLevel,
      languages: data.languages,
      note: data.note,
      capacity: data.capacity,
      openToExtra: data.openToExtra,
      isMember: data.isMember,
      locale: data.locale,
      now: stamp,
    });
    manageUrl = `${origin}/buddy/api/withdraw?token=${manageToken}`;
  }

  const verifyUrl = `${origin}/buddy/api/verify?token=${verifyToken}`;
  const mail = buildEmail("verify", data.locale, { name: data.name, verifyUrl, manageUrl });
  const result = await send(env, { to: data.email, ...mail });
  if (!result.ok && !result.skipped) {
    console.warn(`[buddy] verify email to ${data.email} failed:`, result.status ?? result.reason);
  }

  return wantsJson(request)
    ? json({ ok: true, emailSent: result.ok === true })
    : redirect(localePath(data.locale, "/buddy/check-email"));
}

function guessLocale(value) {
  return ["en", "de", "hr", "bs", "sr"].includes(String(value)) ? String(value) : "en";
}

// --- public: GET /buddy/api/verify?token= -----------------------------------

async function verify(url, _env, { store, now }) {
  const token = url.searchParams.get("token") || "";
  if (!isToken(token)) return redirect("/buddy");

  const row = await store.findByVerifyToken(token);
  if (!row) return redirect("/buddy");

  await store.markVerified(row.id, now());
  return redirect(localePath(row.locale, "/buddy/confirmed"));
}

// --- public: GET /buddy/api/withdraw?token= --------------------------------

async function withdraw(url, _env, { store, now }) {
  const token = url.searchParams.get("token") || "";
  if (!isToken(token)) return redirect("/buddy");

  const row = await store.findByManageToken(token);
  if (!row) return redirect("/buddy");

  await store.withdraw(row.id, now());
  return redirect(localePath(row.locale, "/buddy/removed"));
}

// --- public: GET /buddy/api/pair?t= ---------------------------------------

async function getPair(url, _env, { store }) {
  const token = url.searchParams.get("t") || "";
  if (!isToken(token)) return json({ ok: false, error: "bad token" }, 400);

  const pair = await store.findPairByToken(token);
  if (!pair) return json({ ok: false, error: "not found" }, 404);

  const youAre = pair.buddy_token === token ? "buddy" : "seeker";
  const buddy = await store.signupById(pair.buddy_id);
  const seeker = await store.signupById(pair.seeker_id);
  if (!buddy || !seeker) return json({ ok: false, error: "not found" }, 404);

  const shape = (row) => ({
    name: row.name,
    email: row.email,
    studies: studyLabel(row),
    languages: row.languages || "",
    note: row.note || "",
  });

  const you = youAre === "buddy" ? buddy : seeker;
  const partner = youAre === "buddy" ? seeker : buddy;

  return json({
    ok: true,
    pair: {
      youAre,
      partnerIsBuddy: youAre === "seeker",
      you: shape(you),
      partner: shape(partner),
      confirmed: {
        you: youAre === "buddy" ? Boolean(pair.buddy_confirmed) : Boolean(pair.seeker_confirmed),
      },
    },
  });
}

// --- public: POST /buddy/api/pair/{confirm,flag} --------------------------

async function pairAction(request, action, env, { store, send }) {
  const body = await readBody(request);
  const token = String(body.t || "");
  if (!isToken(token)) return json({ ok: false, error: "bad token" }, 400);

  const pair = await store.findPairByToken(token);
  if (!pair) return json({ ok: false, error: "not found" }, 404);
  const side = pair.buddy_token === token ? "buddy" : "seeker";

  if (action === "confirm") {
    await store.setPairConfirmed(pair.id, side);
    return json({ ok: true });
  }

  // flag → mark it and tell the board
  await store.flagPair(pair.id);
  const buddy = await store.signupById(pair.buddy_id);
  const seeker = await store.signupById(pair.seeker_id);
  const to = env.BUDDY_BOARD_EMAIL || env.BUDDY_EMAIL_REPLYTO || "yunited@shsg.ch";
  await send(env, {
    to,
    subject: "[buddy] a pair flagged a problem",
    text:
      `${side === "buddy" ? buddy?.name : seeker?.name} flagged their pairing as not working.\n\n` +
      `Buddy:  ${buddy?.name} <${buddy?.email}>\n` +
      `Seeker: ${seeker?.name} <${seeker?.email}>\n\n` +
      `Re-pair them in the next round from /admin.`,
    html: `<p>${side === "buddy" ? buddy?.name : seeker?.name} flagged their pairing as not working.</p>`,
  });
  return json({ ok: true });
}

// --- the public router -----------------------------------------------------

/**
 * @param {Request} request
 * @param {Record<string, any>} env
 * @param {URL} url
 * @param {{ store?: any, sendEmail?: Function, now?: () => string, origin?: string }} [deps]
 */
export async function handleBuddyPublic(request, env, url, deps = {}) {
  const store = deps.store ?? buddyStore(env.BUDDY_DB);
  const send = deps.sendEmail ?? sendEmail;
  const now = deps.now ?? (() => new Date().toISOString());
  const origin = deps.origin ?? url.origin;
  const route = url.pathname.slice("/buddy/api/".length);
  const ctx = { store, send, now, origin };

  try {
    if (request.method === "POST" && route === "signup") return await signup(request, env, ctx);
    if (request.method === "GET" && route === "verify") return await verify(url, env, ctx);
    if (request.method === "GET" && route === "withdraw") return await withdraw(url, env, ctx);
    if (request.method === "GET" && route === "pair") return await getPair(url, env, ctx);
    if (request.method === "POST" && route === "pair/confirm")
      return await pairAction(request, "confirm", env, ctx);
    if (request.method === "POST" && route === "pair/flag")
      return await pairAction(request, "flag", env, ctx);
    return json({ ok: false, error: `No such endpoint: ${request.method} ${url.pathname}` }, 404);
  } catch (error) {
    console.error("[buddy]", error);
    return json({ ok: false, error: "Something went wrong. Please try again." }, 500);
  }
}

// --- admin: GET /admin/api/buddy/state ------------------------------------

async function adminState(env, { store }) {
  const counts = await store.counts();
  const pending = (await store.pendingSignups()).map(publicRow);
  const last = await store.lastRound();
  let lastSummary = null;
  if (last) {
    const pairs = await store.roundPairs(last.id);
    lastSummary = {
      id: last.id,
      createdAt: last.created_at,
      createdBy: last.created_by,
      notifiedAt: last.notified_at,
      pairs: pairs.length,
      flagged: pairs.filter((p) => p.flagged).length,
    };
  }
  return json({
    ok: true,
    counts: {
      buddies: Number(counts.buddies || 0),
      seekers: Number(counts.seekers || 0),
      pending: Number(counts.pending || 0),
      matched: Number(counts.matched || 0),
      capacity: Number(counts.capacity || 0),
    },
    pending,
    lastRound: lastSummary,
    // With no key the board confirms signups by hand from this tab; the panel
    // shows a note when this is false.
    emailConfigured: Boolean(env.RESEND_API_KEY),
  });
}

function publicRow(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    audience: row.audience,
    verified: Boolean(row.email_verified),
    status: row.status,
    createdAt: row.created_at,
  };
}

// --- admin: POST /admin/api/buddy/round/preview -------------------------------

async function loadPoolForMatch(store) {
  const buddies = await store.activeBuddies();
  const seekers = await store.unmatchedSeekers();
  const nameOf = new Map();
  for (const b of buddies) nameOf.set(b.id, b.name);
  for (const s of seekers) nameOf.set(s.id, s.name);
  return {
    buddies: buddies.map((b) => ({
      id: b.id,
      capacity: b.capacity,
      openToExtra: Boolean(b.open_to_extra),
    })),
    seekers: seekers.map((s) => ({ id: s.id })),
    nameOf,
  };
}

async function adminPreview(_request, _env, { store }) {
  const pool = await loadPoolForMatch(store);
  const plan = planMatches({ buddies: pool.buddies, seekers: pool.seekers, seed: makeSeed() });
  return json({ ok: true, ...describePlan(plan, pool.nameOf) });
}

function describePlan(plan, nameOf) {
  const name = (id) => nameOf.get(id) || id;
  return {
    seed: plan.seed,
    pairs: plan.pairs.map((p) => ({
      seeker: name(p.seekerId),
      buddy: name(p.buddyId),
      basis: p.basis,
    })),
    unmatched: plan.unmatchedSeekers.map(name),
    idle: plan.idleBuddies.map(name),
    load: Object.fromEntries(Object.entries(plan.load).map(([id, n]) => [name(id), n])),
  };
}

// --- admin: POST /admin/api/buddy/round/commit ------------------------------

async function adminCommit(request, _env, { store, now, actor }) {
  const body = await readBody(request);
  const seed = Number(body.seed);
  if (!Number.isFinite(seed)) return json({ ok: false, error: "Preview a round first." }, 400);

  const pool = await loadPoolForMatch(store);
  const plan = planMatches({ buddies: pool.buddies, seekers: pool.seekers, seed });
  if (plan.pairs.length === 0) {
    return json({ ok: false, error: "Nothing to commit — no pairs in this plan." }, 400);
  }

  const stamp = now();
  const roundId = crypto.randomUUID();
  await store.createRound({ id: roundId, seed: plan.seed, now: stamp, by: actor });

  const rows = plan.pairs.map((p) => ({
    id: crypto.randomUUID(),
    roundId,
    buddyId: p.buddyId,
    seekerId: p.seekerId,
    buddyToken: randomToken(),
    seekerToken: randomToken(),
    basis: p.basis,
    now: stamp,
  }));
  await store.insertPairs(rows);

  const matchedIds = new Set();
  for (const p of plan.pairs) {
    matchedIds.add(p.buddyId);
    matchedIds.add(p.seekerId);
  }
  await store.assignRound([...matchedIds], roundId, stamp);

  return json({
    ok: true,
    roundId,
    pairs: rows.length,
    unmatched: plan.unmatchedSeekers.length,
    idle: plan.idleBuddies.length,
  });
}

// --- admin: POST /admin/api/buddy/round/notify ----------------------------

async function adminNotify(request, env, { store, send, now, origin }) {
  const body = await readBody(request);
  // With an id, that round. Without one, the most recent round — which is what
  // the panel sends, so "Send emails" works no matter what the browser did
  // between commit and send (re-previewed, switched tabs, reloaded).
  const round = body.roundId
    ? await store.roundById(String(body.roundId))
    : await store.lastRound();
  if (!round) return json({ ok: false, error: "There is no round to send emails for." }, 404);
  // Idempotent: a double-click, or a stale button, must not re-send.
  if (round.notified_at) {
    return json({ ok: true, sent: 0, failed: 0, alreadyNotified: true, roundId: round.id });
  }

  const roundId = round.id;
  const pairs = await store.roundPairs(roundId);
  let sent = 0;
  let failed = 0;

  for (const pair of pairs) {
    const buddy = await store.signupById(pair.buddy_id);
    const seeker = await store.signupById(pair.seeker_id);
    if (!buddy || !seeker) continue;

    const toBuddy = buildEmail("matched", buddy.locale, {
      name: buddy.name,
      youAre: "buddy",
      partner: seeker.name,
      pairUrl: `${origin}/buddy/pair?t=${pair.buddy_token}`,
      manageUrl: `${origin}/buddy/api/withdraw?token=${buddy.manage_token}`,
    });
    const toSeeker = buildEmail("matched", seeker.locale, {
      name: seeker.name,
      youAre: "seeker",
      partner: buddy.name,
      partnerRole: studyLabel(buddy),
      pairUrl: `${origin}/buddy/pair?t=${pair.seeker_token}`,
      manageUrl: `${origin}/buddy/api/withdraw?token=${seeker.manage_token}`,
    });

    for (const [row, mail] of [
      [buddy, toBuddy],
      [seeker, toSeeker],
    ]) {
      const r = await send(env, { to: row.email, ...mail });
      if (r.ok) sent += 1;
      else failed += 1;
    }
  }

  // The seekers who signed up, are verified, but weren't paired this round.
  const stillWaiting = await store.unmatchedSeekers();
  for (const row of stillWaiting) {
    const mail = buildEmail("noMatch", row.locale, {
      name: row.name,
      manageUrl: `${origin}/buddy/api/withdraw?token=${row.manage_token}`,
    });
    const r = await send(env, { to: row.email, ...mail });
    if (r.ok) sent += 1;
    else failed += 1;
  }

  await store.markRoundNotified(roundId, now());
  return json({ ok: true, roundId, sent, failed, waiting: stillWaiting.length });
}

// --- admin: POST /admin/api/buddy/signup ---------------------------------

async function adminSignupAction(request, _env, { store, now }) {
  const body = await readBody(request);
  const id = String(body.id || "");
  const action = String(body.action || "");
  const row = await store.signupById(id);
  if (!row) return json({ ok: false, error: "That signup no longer exists." }, 404);

  if (action === "verify") {
    await store.markVerified(id, now());
    return json({ ok: true, message: `${row.name} marked confirmed.` });
  }
  if (action === "remove") {
    await store.removeSignup(id);
    return json({ ok: true, message: `${row.name} removed.` });
  }
  return json({ ok: false, error: "Unknown action." }, 400);
}

// --- admin: GET /admin/api/buddy/export.csv -----------------------------

async function adminExport(_env, { store }) {
  const rows = await store.allSignups();
  const header = [
    "name",
    "email",
    "role",
    "audience",
    "study_level",
    "languages",
    "capacity",
    "open_to_extra",
    "is_member",
    "status",
    "created_at",
  ];
  const escape = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.name,
        r.email,
        r.role,
        r.audience,
        r.study_level,
        r.languages,
        r.capacity,
        r.open_to_extra,
        r.is_member,
        r.status,
        r.created_at,
      ]
        .map(escape)
        .join(","),
    );
  }
  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="buddy-signups.csv"',
      "Cache-Control": "no-store",
    },
  });
}

// --- the admin router ----------------------------------------------------

/**
 * @param {string} route  the part after "/admin/api/buddy/"
 * @param {Request} request
 * @param {Record<string, any>} env
 * @param {{ store?: any, sendEmail?: Function, now?: () => string, origin?: string, actor?: string }} [deps]
 */
export async function handleBuddyAdmin(route, request, env, deps = {}) {
  const store = deps.store ?? buddyStore(env.BUDDY_DB);
  const send = deps.sendEmail ?? sendEmail;
  const now = deps.now ?? (() => new Date().toISOString());
  const origin = deps.origin ?? env.SITE_ORIGIN ?? "https://yunited.ch";
  const ctx = { store, send, now, origin, actor: deps.actor };
  const key = `${request.method} ${route}`;

  if (key === "GET state") return adminState(env, ctx);
  if (key === "POST round/preview") return adminPreview(request, env, ctx);
  if (key === "POST round/commit") return adminCommit(request, env, ctx);
  if (key === "POST round/notify") return adminNotify(request, env, ctx);
  if (key === "POST signup") return adminSignupAction(request, env, ctx);
  if (key === "GET export.csv") return adminExport(env, ctx);
  return json({ ok: false, error: `No such endpoint: ${request.method} buddy/${route}` }, 404);
}

// --- the retention sweep (called from worker/index.js `scheduled`) -------

/**
 * Delete unverified signups older than PENDING_TTL_DAYS. Idempotent, never
 * throws — nobody is watching a cron.
 */
export async function purgeStaleBuddySignups(env, deps = {}) {
  if (!env.BUDDY_DB) return;
  const store = deps.store ?? buddyStore(env.BUDDY_DB);
  const now = deps.now ? new Date(deps.now()) : new Date();
  const cutoff = new Date(now.getTime() - PENDING_TTL_DAYS * 86400_000).toISOString();
  try {
    const removed = await store.purgeStalePending(cutoff);
    if (removed > 0) console.log(`[buddy] sweep: removed ${removed} unverified signup(s) older than ${PENDING_TTL_DAYS}d`);
  } catch (error) {
    console.error("[buddy] sweep failed:", error);
  }
}
