-- Stage 9 foundation. Calculation writes are connected after policy decisions.
CREATE TABLE peoria_runs (
  run_id TEXT PRIMARY KEY NOT NULL,
  round_id TEXT NOT NULL REFERENCES rounds(round_id),
  ordinal INTEGER NOT NULL CHECK(typeof(ordinal)='integer' AND ordinal BETWEEN 1 AND 3),
  calculated_at INTEGER NOT NULL,
  actor_id TEXT NOT NULL REFERENCES users(user_id),
  actor_name TEXT NOT NULL,
  source_record_version INTEGER NOT NULL CHECK(source_record_version>=0),
  algorithm_version TEXT NOT NULL,
  snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json) AND json_type(snapshot_json)='object'),
  target_slots_json TEXT NOT NULL CHECK(json_valid(target_slots_json) AND json_type(target_slots_json)='array'),
  excluded_slots_json TEXT NOT NULL CHECK(json_valid(excluded_slots_json) AND json_type(excluded_slots_json)='array'),
  results_json TEXT NOT NULL CHECK(json_valid(results_json) AND json_type(results_json)='array'),
  hidden_holes_json TEXT NOT NULL CHECK(json_valid(hidden_holes_json) AND json_type(hidden_holes_json)='array'),
  request_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  UNIQUE(round_id,ordinal),
  UNIQUE(actor_id,request_id)
);
