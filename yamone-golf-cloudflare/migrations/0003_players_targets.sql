ALTER TABLE rounds ADD COLUMN roster_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE player_slots ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE player_slots ADD COLUMN deleted_at INTEGER;
CREATE UNIQUE INDEX player_round_slot ON player_slots(round_id,slot_id);
CREATE INDEX round_live_slots ON player_slots(round_id,deleted_at,position);
CREATE TABLE input_target_lists (
  round_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY(round_id,user_id),
  FOREIGN KEY(round_id,user_id) REFERENCES round_participants(round_id,user_id)
);
CREATE TABLE input_targets (
  round_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  slot_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  PRIMARY KEY(round_id,user_id,slot_id),
  FOREIGN KEY(round_id,user_id) REFERENCES input_target_lists(round_id,user_id),
  FOREIGN KEY(round_id,slot_id) REFERENCES player_slots(round_id,slot_id)
);
CREATE TABLE player_mutations (
  user_id TEXT NOT NULL REFERENCES users(user_id),
  mutation_id TEXT NOT NULL,
  round_id TEXT NOT NULL REFERENCES rounds(round_id),
  request_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,mutation_id)
);
CREATE TABLE player_audit (
  audit_id TEXT PRIMARY KEY NOT NULL,
  round_id TEXT NOT NULL,
  slot_id TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES users(user_id),
  kind TEXT NOT NULL CHECK(kind IN ('add','rename','link','unlink','delete')),
  before_json TEXT,
  after_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(round_id,slot_id) REFERENCES player_slots(round_id,slot_id)
);
-- Reference schemas reserved for stages 4 and 7. No score/delivery/receipt mutation APIs yet.
-- Nullable strokes are the unentered state; tombstones can retain score versions after deletion.
CREATE TABLE scores (
  round_id TEXT NOT NULL,
  slot_id TEXT NOT NULL,
  hole INTEGER NOT NULL CHECK(hole BETWEEN 1 AND 18),
  strokes INTEGER CHECK(strokes IS NULL OR (typeof(strokes)='integer' AND strokes>=1)),
  version INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT NOT NULL REFERENCES users(user_id),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(slot_id,hole),
  FOREIGN KEY(round_id,slot_id) REFERENCES player_slots(round_id,slot_id)
);
CREATE TABLE deliveries (
  delivery_id TEXT PRIMARY KEY NOT NULL,
  round_id TEXT NOT NULL,
  slot_id TEXT NOT NULL,
  sender_id TEXT NOT NULL REFERENCES users(user_id),
  recipient_id TEXT NOT NULL REFERENCES users(user_id),
  status TEXT NOT NULL CHECK(status IN ('pending','received','cancelled')),
  created_at INTEGER NOT NULL,
  FOREIGN KEY(round_id,slot_id) REFERENCES player_slots(round_id,slot_id)
);
CREATE TABLE receipts (
  receipt_id TEXT PRIMARY KEY NOT NULL,
  round_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(user_id),
  player_slot_id TEXT NOT NULL,
  delivery_id TEXT NOT NULL UNIQUE REFERENCES deliveries(delivery_id),
  status TEXT NOT NULL CHECK(status IN ('received','deleted')),
  received_at INTEGER NOT NULL,
  deleted_at INTEGER,
  FOREIGN KEY(round_id,player_slot_id) REFERENCES player_slots(round_id,slot_id)
);
CREATE INDEX slot_deliveries ON deliveries(slot_id);
CREATE INDEX slot_receipts ON receipts(player_slot_id);
