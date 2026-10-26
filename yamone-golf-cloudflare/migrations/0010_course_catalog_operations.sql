-- Additive schema for the recovered 0.3.22 runtime. Never resets courses or user data.
ALTER TABLE courses ADD COLUMN address TEXT NOT NULL DEFAULT '';
ALTER TABLE courses ADD COLUMN phone TEXT;
ALTER TABLE courses ADD COLUMN website TEXT;
ALTER TABLE courses ADD COLUMN latitude REAL;
ALTER TABLE courses ADD COLUMN longitude REAL;
ALTER TABLE courses ADD COLUMN source_hash TEXT;
ALTER TABLE courses ADD COLUMN localized_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(localized_json));
ALTER TABLE courses ADD COLUMN region_group TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS country_course_settings (
  country_code TEXT PRIMARY KEY NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  locked INTEGER NOT NULL DEFAULT 1 CHECK(locked IN (0,1)),
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS course_deleted_items (
  course_id TEXT PRIMARY KEY NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
  previous_active INTEGER NOT NULL CHECK(previous_active IN (0,1)),
  deleted_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS course_requests (
  request_id TEXT PRIMARY KEY NOT NULL,
  requester_id TEXT NOT NULL REFERENCES users(user_id),
  course_id TEXT REFERENCES courses(course_id),
  category TEXT NOT NULL CHECK(category IN (
    'course_name','address','region_city','contact','website',
    'segment_name','hole_par','segment_add','segment_delete',
    'duplicate_merge','operating_status','other'
  )),
  description TEXT NOT NULL,
  requested_value_json TEXT CHECK(requested_value_json IS NULL OR json_valid(requested_value_json)),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','processing','completed','on_hold','rejected')),
  admin_note TEXT,
  resolution_json TEXT CHECK(resolution_json IS NULL OR json_valid(resolution_json)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  resolved_at INTEGER
);

CREATE TABLE IF NOT EXISTS golfcore_catalog_courses (
  slug TEXT PRIMARY KEY NOT NULL CHECK(length(slug) BETWEEN 1 AND 120),
  name TEXT NOT NULL,
  country_code TEXT NOT NULL CHECK(length(country_code)=2),
  region TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  phone TEXT,
  website TEXT,
  timezone TEXT,
  latitude REAL,
  longitude REAL,
  hole_count INTEGER,
  par_total INTEGER,
  coverage_json TEXT NOT NULL CHECK(json_valid(coverage_json)),
  layouts_json TEXT CHECK(layouts_json IS NULL OR json_valid(layouts_json)),
  source_payload_json TEXT NOT NULL CHECK(json_valid(source_payload_json)),
  source_hash TEXT NOT NULL,
  source_url TEXT NOT NULL,
  detail_state TEXT NOT NULL CHECK(detail_state IN ('full','summary')),
  last_error TEXT,
  source_retrieved_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS golfcore_sync_state (
  country_code TEXT PRIMARY KEY NOT NULL CHECK(length(country_code)=2),
  priority INTEGER NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','running','complete','error','paused')),
  next_offset INTEGER NOT NULL DEFAULT 0 CHECK(next_offset>=0),
  total_hint INTEGER,
  cycle_started_at INTEGER,
  last_success_at INTEGER,
  last_completed_at INTEGER,
  last_error TEXT,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_course_deleted_items_deleted_at ON course_deleted_items(deleted_at DESC,course_id);
CREATE INDEX IF NOT EXISTS idx_course_requests_user ON course_requests(requester_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_catalog_country ON golfcore_catalog_courses(country_code,name,slug);
INSERT OR IGNORE INTO country_course_settings(country_code) VALUES ('KR'),('PH'),('JP'),('CN'),('TW'),('VN'),('TH'),('MY'),('ID');
