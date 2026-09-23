-- Ending and each player's completion are independent facts.
ALTER TABLE rounds ADD COLUMN record_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rounds ADD COLUMN permission_version INTEGER NOT NULL DEFAULT 0;
CREATE INDEX rounds_expiry ON rounds(status, updated_at);
CREATE TABLE round_endings (
  round_id TEXT PRIMARY KEY REFERENCES rounds(round_id),
  batch_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK(reason IN ('manual','inactivity')),
  actor_id TEXT REFERENCES users(user_id),
  ended_at INTEGER NOT NULL,
  processed_at INTEGER NOT NULL
);
CREATE INDEX round_endings_batch ON round_endings(batch_id);
CREATE TABLE round_completions (
  round_id TEXT NOT NULL,
  slot_id TEXT NOT NULL,
  holes_recorded INTEGER NOT NULL,
  hole_count INTEGER NOT NULL CHECK(hole_count IN (9,18)),
  complete INTEGER NOT NULL CHECK(complete IN (0,1)),
  PRIMARY KEY(round_id,slot_id),
  FOREIGN KEY(round_id,slot_id) REFERENCES player_slots(round_id,slot_id)
);
CREATE TABLE round_lifecycle_mutations (
  user_id TEXT NOT NULL REFERENCES users(user_id),
  mutation_id TEXT NOT NULL,
  round_id TEXT NOT NULL REFERENCES rounds(round_id),
  request_hash TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('end','permission')),
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,mutation_id)
);
