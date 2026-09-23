ALTER TABLE deliveries ADD COLUMN updated_at INTEGER;
CREATE UNIQUE INDEX one_pending_delivery ON deliveries(round_id,slot_id,recipient_id) WHERE status='pending';
CREATE INDEX delivery_inbox ON deliveries(recipient_id,status,created_at,delivery_id);
CREATE UNIQUE INDEX one_active_receipt ON receipts(user_id,round_id) WHERE status='received';
CREATE INDEX receipt_list ON receipts(user_id,status,received_at,receipt_id);
CREATE TABLE record_mutations (
  user_id TEXT NOT NULL REFERENCES users(user_id),
  mutation_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  result_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,mutation_id)
);
CREATE TABLE receipt_actions (
  action_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(user_id),
  delivery_id TEXT NOT NULL REFERENCES deliveries(delivery_id),
  ad_outcome TEXT CHECK(ad_outcome IN ('completed','unavailable','load_failed','show_failed','load_timeout')),
  ad_source TEXT,
  ad_settled_at INTEGER,
  completed_receipt_id TEXT REFERENCES receipts(receipt_id),
  created_at INTEGER NOT NULL
);
-- Preserve previous settlements while allowing receive-only actions to settle an ad.
CREATE TABLE round_ad_settlements_next (
  user_id TEXT NOT NULL REFERENCES users(user_id),
  round_id TEXT NOT NULL REFERENCES rounds(round_id),
  action_id TEXT REFERENCES round_actions(action_id),
  receive_action_id TEXT REFERENCES receipt_actions(action_id),
  outcome TEXT NOT NULL,
  source TEXT NOT NULL,
  settled_at INTEGER NOT NULL,
  CHECK((action_id IS NULL) <> (receive_action_id IS NULL)),
  PRIMARY KEY(user_id,round_id)
);
INSERT INTO round_ad_settlements_next(user_id,round_id,action_id,outcome,source,settled_at)
  SELECT user_id,round_id,action_id,outcome,source,settled_at FROM round_ad_settlements;
DROP TABLE round_ad_settlements;
ALTER TABLE round_ad_settlements_next RENAME TO round_ad_settlements;
