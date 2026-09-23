-- Null score rows retain versions after deletion to prevent stale overwrites.
CREATE TABLE score_mutations (
 user_id TEXT NOT NULL REFERENCES users(user_id),
 mutation_id TEXT NOT NULL,
 round_id TEXT NOT NULL REFERENCES rounds(round_id),
 request_hash TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(user_id, mutation_id)
);
CREATE TABLE score_audit (
 audit_id TEXT PRIMARY KEY,
 round_id TEXT NOT NULL,
 slot_id TEXT NOT NULL,
 hole INTEGER NOT NULL,
 actor_id TEXT NOT NULL REFERENCES users(user_id),
 before_strokes INTEGER,
 after_strokes INTEGER,
 version INTEGER NOT NULL,
 created_at INTEGER NOT NULL,
 FOREIGN KEY(round_id,slot_id) REFERENCES player_slots(round_id,slot_id)
);
CREATE INDEX scores_round ON scores(round_id,hole);
CREATE INDEX score_audit_round ON score_audit(round_id,created_at);
