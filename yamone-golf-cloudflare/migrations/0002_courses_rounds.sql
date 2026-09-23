CREATE TABLE courses (
  course_id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  region TEXT NOT NULL,
  segments_json TEXT NOT NULL CHECK(json_valid(segments_json)),
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL REFERENCES users(user_id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX course_search ON courses(name,course_id);
CREATE TABLE course_lists (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(user_id),
  version INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE user_courses (
  user_id TEXT NOT NULL REFERENCES users(user_id),
  course_id TEXT NOT NULL REFERENCES courses(course_id),
  sort_order INTEGER NOT NULL,
  PRIMARY KEY(user_id,course_id)
);
CREATE TABLE rounds (
  round_id TEXT PRIMARY KEY NOT NULL,
  creator_id TEXT NOT NULL REFERENCES users(user_id),
  join_code TEXT NOT NULL UNIQUE,
  course_snapshot TEXT NOT NULL CHECK(json_valid(course_snapshot)),
  hole_count INTEGER NOT NULL CHECK(hole_count IN (9,18)),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','ended')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  ended_at INTEGER
);
CREATE TABLE round_participants (
  round_id TEXT NOT NULL REFERENCES rounds(round_id),
  user_id TEXT NOT NULL REFERENCES users(user_id),
  joined_at INTEGER NOT NULL,
  can_end INTEGER NOT NULL DEFAULT 0 CHECK(can_end IN (0,1)),
  PRIMARY KEY(round_id,user_id)
);
CREATE TABLE active_round_users (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(user_id),
  round_id TEXT NOT NULL REFERENCES rounds(round_id)
);
CREATE TABLE player_slots (
  slot_id TEXT PRIMARY KEY NOT NULL,
  round_id TEXT NOT NULL REFERENCES rounds(round_id),
  user_id TEXT REFERENCES users(user_id),
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  UNIQUE(round_id,position),
  UNIQUE(round_id,user_id)
);
CREATE TABLE round_invitations (
  invitation_id TEXT PRIMARY KEY NOT NULL,
  round_id TEXT NOT NULL REFERENCES rounds(round_id),
  sender_id TEXT NOT NULL REFERENCES users(user_id),
  recipient_id TEXT NOT NULL REFERENCES users(user_id),
  status TEXT NOT NULL CHECK(status IN ('pending','accepted','declined','cancelled')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX one_pending_invite ON round_invitations(round_id,recipient_id) WHERE status='pending';
CREATE INDEX user_invites ON round_invitations(recipient_id,status);
CREATE TABLE round_actions (
  action_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(user_id),
  kind TEXT NOT NULL CHECK(kind IN ('create','join')),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  ad_outcome TEXT CHECK(ad_outcome IN ('completed','unavailable','load_failed','show_failed','load_timeout')),
  ad_source TEXT,
  ad_settled_at INTEGER,
  completed_round_id TEXT REFERENCES rounds(round_id),
  created_at INTEGER NOT NULL
);
CREATE TABLE round_ad_settlements (
  user_id TEXT NOT NULL REFERENCES users(user_id),
  round_id TEXT NOT NULL REFERENCES rounds(round_id),
  action_id TEXT NOT NULL REFERENCES round_actions(action_id),
  outcome TEXT NOT NULL,
  source TEXT NOT NULL,
  settled_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,round_id)
);
-- Short-lived rows used to abort an entire D1 batch when a condition is no longer true.
-- Rows are inserted and deleted inside the same atomic batch, never left after commit.
CREATE TABLE mutation_guards (
  guard_id TEXT PRIMARY KEY NOT NULL,
  valid INTEGER NOT NULL CHECK(valid=1)
);
