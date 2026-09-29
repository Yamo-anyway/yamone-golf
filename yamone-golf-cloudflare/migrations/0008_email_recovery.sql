-- Optional verified recovery email. This is not an email login account.
CREATE TABLE user_recovery_emails (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(user_id),
  email_normalized TEXT NOT NULL UNIQUE,
  email_hash TEXT NOT NULL UNIQUE,
  verified_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE email_verification_requests (
  request_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(user_id),
  email_normalized TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  language TEXT NOT NULL CHECK(language IN ('ko','en')),
  status TEXT NOT NULL CHECK(status IN ('pending','sent','verified','failed')),
  provider_id TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  sent_at INTEGER,
  verified_at INTEGER
);
CREATE INDEX email_verification_user ON email_verification_requests(user_id,created_at);

CREATE TABLE email_recovery_requests (
  request_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT REFERENCES users(user_id),
  email_hash TEXT NOT NULL,
  code_hash TEXT,
  language TEXT NOT NULL CHECK(language IN ('ko','en')),
  status TEXT NOT NULL CHECK(status IN ('accepted','sent','claimed','failed')),
  provider_id TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  sent_at INTEGER,
  claimed_at INTEGER
);
CREATE INDEX email_recovery_user ON email_recovery_requests(user_id,created_at);
CREATE INDEX email_recovery_expiry ON email_recovery_requests(status,expires_at);
