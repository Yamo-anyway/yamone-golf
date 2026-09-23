-- Identity only. Round tables and their expiry job belong to the next stages.
CREATE TABLE users (
  user_id TEXT PRIMARY KEY NOT NULL,
  nickname TEXT NOT NULL CHECK(length(nickname) BETWEEN 1 AND 16),
  personal_code TEXT NOT NULL UNIQUE,
  language TEXT NOT NULL DEFAULT 'system' CHECK(language IN ('system','ko','en')),
  recovery_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE devices (
  device_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(user_id),
  token_hash TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL CHECK(purpose IN ('registration','recovery')),
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE UNIQUE INDEX one_active_device ON devices(user_id) WHERE revoked_at IS NULL;
CREATE TABLE recovery_claims (
  token_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(user_id),
  created_at INTEGER NOT NULL
);
CREATE TABLE request_limits (
  bucket TEXT PRIMARY KEY NOT NULL,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX expired_request_limits ON request_limits(expires_at);
