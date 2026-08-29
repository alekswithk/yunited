// Every D1 query the buddy system runs, behind named methods.
//
// worker/buddy.js takes a *store* (this shape) as an injected dependency, so its
// request handlers are unit-tested against an in-memory fake — the same split as
// the rest of worker/, where logic is testable under plain Node and the thin
// I/O layer is not. This file is that thin layer: it is verified by the
// migration and by a local `wrangler d1` run, not by npm test.
//
// Bind params are ?1-style positional so the SQL reads next to its arguments.

/**
 * @param {D1Database} db  env.BUDDY_DB
 */
export function buddyStore(db) {
  const rows = async (stmt) => (await stmt.all()).results ?? [];

  return {
    async findActiveByEmail(email) {
      return db
        .prepare(
          `SELECT * FROM signups WHERE email = ?1 AND status IN ('pending','active','matched') LIMIT 1`,
        )
        .bind(email)
        .first();
    },

    async insertSignup(row) {
      await db
        .prepare(
          `INSERT INTO signups
             (id, role, name, email, email_verified, verify_token, manage_token,
              audience, study_level, languages, note, capacity, open_to_extra,
              is_member, locale, status, round_id, created_at, updated_at)
           VALUES (?1,?2,?3,?4,0,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,'pending',NULL,?15,?15)`,
        )
        .bind(
          row.id,
          row.role,
          row.name,
          row.email,
          row.verifyToken,
          row.manageToken,
          row.audience,
          row.studyLevel,
          row.languages,
          row.note,
          row.capacity,
          row.openToExtra ? 1 : 0,
          row.isMember ? 1 : 0,
          row.locale,
          row.now,
        )
        .run();
    },

    async refreshPending(id, verifyToken, now) {
      await db
        .prepare(`UPDATE signups SET verify_token = ?2, updated_at = ?3 WHERE id = ?1`)
        .bind(id, verifyToken, now)
        .run();
    },

    async findByVerifyToken(token) {
      return db.prepare(`SELECT * FROM signups WHERE verify_token = ?1 LIMIT 1`).bind(token).first();
    },

    async markVerified(id, now) {
      await db
        .prepare(
          `UPDATE signups SET email_verified = 1, status = 'active', verify_token = NULL, updated_at = ?2 WHERE id = ?1`,
        )
        .bind(id, now)
        .run();
    },

    async findByManageToken(token) {
      return db.prepare(`SELECT * FROM signups WHERE manage_token = ?1 LIMIT 1`).bind(token).first();
    },

    async withdraw(id, now) {
      await db
        .prepare(`UPDATE signups SET status = 'withdrawn', updated_at = ?2 WHERE id = ?1`)
        .bind(id, now)
        .run();
    },

    async activeBuddies() {
      return rows(
        db.prepare(
          `SELECT * FROM signups WHERE role = 'buddy' AND status = 'active' AND email_verified = 1`,
        ),
      );
    },

    async unmatchedSeekers() {
      return rows(
        db.prepare(
          `SELECT * FROM signups WHERE role = 'seeker' AND status = 'active' AND email_verified = 1`,
        ),
      );
    },

    async createRound(round) {
      await db
        .prepare(
          `INSERT INTO rounds (id, seed, created_at, created_by, notes) VALUES (?1,?2,?3,?4,'')`,
        )
        .bind(round.id, round.seed, round.now, round.by ?? null)
        .run();
    },

    async insertPairs(pairs) {
      if (pairs.length === 0) return;
      await db.batch(
        pairs.map((p) =>
          db
            .prepare(
              `INSERT INTO pairs
                 (id, round_id, buddy_id, seeker_id, buddy_token, seeker_token, basis, created_at)
               VALUES (?1,?2,?3,?4,?5,?6,?7,?8)`,
            )
            .bind(p.id, p.roundId, p.buddyId, p.seekerId, p.buddyToken, p.seekerToken, p.basis, p.now),
        ),
      );
    },

    async assignRound(personIds, roundId, now) {
      const ids = [...new Set(personIds)];
      if (ids.length === 0) return;
      const marks = ids.map((_, i) => `?${i + 3}`).join(",");
      await db
        .prepare(
          `UPDATE signups SET status = 'matched', round_id = ?1, updated_at = ?2 WHERE id IN (${marks})`,
        )
        .bind(roundId, now, ...ids)
        .run();
    },

    async findPairByToken(token) {
      return db
        .prepare(`SELECT * FROM pairs WHERE buddy_token = ?1 OR seeker_token = ?1 LIMIT 1`)
        .bind(token)
        .first();
    },

    async signupById(id) {
      return db.prepare(`SELECT * FROM signups WHERE id = ?1 LIMIT 1`).bind(id).first();
    },

    async setPairConfirmed(id, side) {
      const col = side === "buddy" ? "buddy_confirmed" : "seeker_confirmed";
      await db.prepare(`UPDATE pairs SET ${col} = 1 WHERE id = ?1`).bind(id).run();
    },

    async flagPair(id) {
      await db.prepare(`UPDATE pairs SET flagged = 1 WHERE id = ?1`).bind(id).run();
    },

    async lastRound() {
      return db.prepare(`SELECT * FROM rounds ORDER BY created_at DESC LIMIT 1`).first();
    },

    async roundById(id) {
      return db.prepare(`SELECT * FROM rounds WHERE id = ?1 LIMIT 1`).bind(id).first();
    },

    async roundPairs(roundId) {
      return rows(db.prepare(`SELECT * FROM pairs WHERE round_id = ?1`).bind(roundId));
    },

    async markRoundNotified(roundId, now) {
      await db.prepare(`UPDATE rounds SET notified_at = ?2 WHERE id = ?1`).bind(roundId, now).run();
    },

    async counts() {
      return (
        (await db
          .prepare(
            `SELECT
               COALESCE(SUM(role = 'buddy'  AND status = 'active'), 0)  AS buddies,
               COALESCE(SUM(role = 'seeker' AND status = 'active'), 0)  AS seekers,
               COALESCE(SUM(status = 'pending'), 0)                     AS pending,
               COALESCE(SUM(status = 'matched'), 0)                     AS matched,
               COALESCE(SUM(role = 'buddy' AND status = 'active' AND (capacity + open_to_extra)), 0) AS capacity
             FROM signups`,
          )
          .first()) ?? {}
      );
    },

    async allSignups() {
      return rows(db.prepare(`SELECT * FROM signups ORDER BY created_at DESC`));
    },

    async pendingSignups() {
      return rows(
        db.prepare(`SELECT * FROM signups WHERE status = 'pending' ORDER BY created_at DESC`),
      );
    },

    async removeSignup(id) {
      await db.prepare(`DELETE FROM signups WHERE id = ?1`).bind(id).run();
    },

    async purgeStalePending(cutoffIso) {
      const result = await db
        .prepare(`DELETE FROM signups WHERE status = 'pending' AND created_at < ?1`)
        .bind(cutoffIso)
        .run();
      return result?.meta?.changes ?? 0;
    },
  };
}
