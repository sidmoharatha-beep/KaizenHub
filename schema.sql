-- ================================================================
--  KaizenHub — Cloudflare D1 Schema
--  Run this in Cloudflare Dashboard → D1 → your DB → Console
--  OR via: wrangler d1 execute kaizenhub-db --file=schema.sql
-- ================================================================

-- 1. USERS (replaces Supabase Auth + profiles)
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,          -- UUID generated server-side
  emp_id      TEXT UNIQUE NOT NULL,
  full_name   TEXT NOT NULL,
  email       TEXT UNIQUE NOT NULL,
  password    TEXT NOT NULL,             -- bcrypt hash
  role        TEXT NOT NULL CHECK(role IN ('admin','manager','operator')),
  unit        TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  created_by  TEXT
);

-- 2. SESSIONS
CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- 3. SUBMISSIONS
CREATE TABLE IF NOT EXISTS submissions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emp_id      TEXT NOT NULL,
  full_name   TEXT NOT NULL,
  unit        TEXT NOT NULL,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  saving      INTEGER DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Approved','Rejected')),
  points      INTEGER DEFAULT 0,
  feedback    TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- 4. AUDIT LOG (new feature — every important action is stored)
CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id    TEXT NOT NULL,
  actor_name  TEXT NOT NULL,
  action      TEXT NOT NULL,
  target_type TEXT,                      -- 'submission', 'user', 'session'
  target_id   TEXT,
  detail      TEXT,                      -- JSON or plain text
  ip          TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- 5. PASSWORD RESET TOKENS
CREATE TABLE IF NOT EXISTS password_resets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  new_password TEXT NOT NULL,           -- bcrypt hash, set by admin
  reset_by    TEXT NOT NULL,
  used        INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_user ON submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_audit_actor      ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_created    ON audit_log(created_at);
