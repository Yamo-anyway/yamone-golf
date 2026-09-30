ALTER TABLE courses ADD COLUMN country_code TEXT NOT NULL DEFAULT '' CHECK(country_code = '' OR length(country_code) = 2);
ALTER TABLE courses ADD COLUMN city TEXT NOT NULL DEFAULT '';
ALTER TABLE courses ADD COLUMN source_name TEXT;
ALTER TABLE courses ADD COLUMN source_url TEXT;
ALTER TABLE courses ADD COLUMN source_external_id TEXT;
ALTER TABLE courses ADD COLUMN source_retrieved_at INTEGER;
ALTER TABLE courses ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1));
ALTER TABLE courses ADD COLUMN managed_by_admin INTEGER NOT NULL DEFAULT 0 CHECK(managed_by_admin IN (0,1));

CREATE UNIQUE INDEX course_source_identity
  ON courses(source_name,source_external_id)
  WHERE source_name IS NOT NULL AND source_external_id IS NOT NULL;
CREATE INDEX course_catalog_search
  ON courses(active,country_code,city,name,course_id);

CREATE TABLE course_admin_changes (
  change_id TEXT PRIMARY KEY NOT NULL,
  course_id TEXT NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK(action IN ('create','import','update','deactivate','reactivate')),
  before_json TEXT CHECK(before_json IS NULL OR json_valid(before_json)),
  after_json TEXT NOT NULL CHECK(json_valid(after_json)),
  created_at INTEGER NOT NULL
);
CREATE INDEX course_admin_change_history
  ON course_admin_changes(course_id,created_at DESC,change_id);
