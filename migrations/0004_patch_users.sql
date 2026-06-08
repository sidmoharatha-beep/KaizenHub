-- 0004_patch_users.sql
-- Add missing columns to match existing auth.js schema
ALTER TABLE users ADD COLUMN full_name TEXT;
ALTER TABLE users ADD COLUMN emp_id TEXT;
ALTER TABLE users ADD COLUMN password TEXT;
ALTER TABLE users ADD COLUMN unit TEXT;

-- sessions table from your auth.js
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
