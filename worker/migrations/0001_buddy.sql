-- Buddy-system store. Applied with:
--   npx wrangler d1 migrations apply yunited-buddy            (local)
--   npx wrangler d1 migrations apply yunited-buddy --remote   (production)
--
-- This is the first data the project keeps outside Git. Content stays in
-- content/*.json; per-student signups are private, change often, and must not
-- rebuild the site — so they live in D1, reached only through /buddy/api/* and
-- /admin/api/buddy/* in the same Worker.

CREATE TABLE signups (
  id             TEXT PRIMARY KEY,          -- uuid
  role           TEXT NOT NULL,             -- 'buddy' | 'seeker'
  name           TEXT NOT NULL,
  email          TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  verify_token   TEXT,                      -- cleared once confirmed
  manage_token   TEXT NOT NULL,             -- stable; the unsubscribe link
  audience       TEXT NOT NULL,             -- 'hsg' | 'exchange'
  study_level    TEXT,                      -- 'assessment'|'bachelor'|'master'|'other'|NULL
  languages      TEXT NOT NULL DEFAULT '',
  note           TEXT NOT NULL DEFAULT '',
  capacity       INTEGER NOT NULL DEFAULT 1,
  open_to_extra  INTEGER NOT NULL DEFAULT 0,
  is_member      INTEGER NOT NULL DEFAULT 0,
  locale         TEXT NOT NULL DEFAULT 'en',
  status         TEXT NOT NULL DEFAULT 'pending', -- 'pending'|'active'|'matched'|'withdrawn'
  round_id       TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE INDEX idx_signups_status ON signups (status);
CREATE INDEX idx_signups_verify ON signups (verify_token);
CREATE INDEX idx_signups_manage ON signups (manage_token);
CREATE INDEX idx_signups_email  ON signups (email);

CREATE TABLE rounds (
  id          TEXT PRIMARY KEY,
  seed        INTEGER NOT NULL,             -- replays the exact pairing
  created_at  TEXT NOT NULL,
  created_by  TEXT,                         -- board member's verified email
  notified_at TEXT,                         -- set once the emails have gone out
  notes       TEXT NOT NULL DEFAULT ''
);

CREATE TABLE pairs (
  id               TEXT PRIMARY KEY,
  round_id         TEXT NOT NULL,
  buddy_id         TEXT NOT NULL,           -- -> signups.id
  seeker_id        TEXT NOT NULL,           -- -> signups.id
  buddy_token      TEXT NOT NULL,           -- in the buddy's email link
  seeker_token     TEXT NOT NULL,           -- in the seeker's email link
  basis            TEXT NOT NULL DEFAULT 'fill', -- 'fill' | 'overflow'
  buddy_confirmed  INTEGER NOT NULL DEFAULT 0,
  seeker_confirmed INTEGER NOT NULL DEFAULT 0,
  flagged          INTEGER NOT NULL DEFAULT 0,
  archived         INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL
);

CREATE INDEX idx_pairs_round  ON pairs (round_id);
CREATE INDEX idx_pairs_btoken ON pairs (buddy_token);
CREATE INDEX idx_pairs_stoken ON pairs (seeker_token);
CREATE INDEX idx_pairs_people ON pairs (buddy_id, seeker_id);
