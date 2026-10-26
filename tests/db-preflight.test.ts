import { before, test } from "node:test";
import assert from "node:assert/strict";
import { backup, DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  capture,
  compare,
  expectedSnapshot,
  migrationFiles,
  normalizeSQL,
  sqliteQuery,
} from "../scripts/lib/db-preflight";

const directory = resolve("yamone-golf-cloudflare/migrations");
let expected: Awaited<ReturnType<typeof expectedSnapshot>>;
before(async () => {
  expected = await expectedSnapshot(directory);
});
const files = migrationFiles(directory);
function fixture(limit = files.length) {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "PRAGMA foreign_keys=ON; CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT)",
  );
  for (const file of files.slice(0, limit)) {
    db.exec(file.sql);
    db.prepare("INSERT INTO d1_migrations(name) VALUES(?)").run(file.name);
  }
  return db;
}
test("fresh schema and recorded history match; read-only capture never fetches user rows", async () => {
  const db = fixture();
  try {
    const queries: string[] = [];
    const query = sqliteQuery(db);
    const snapshot = await capture(async (statements) => {
      queries.push(...statements);
      return query(statements);
    });
    assert.equal(compare(expected, snapshot).schema_and_history_match, true);
    assert.equal(compare(expected, snapshot).automatic_apply_allowed, false);
    assert.ok(
      queries.every((sql) =>
        /^(SELECT|PRAGMA (table_info|foreign_key_list)\()/i.test(sql),
      ),
    );
    assert.ok(
      !queries.some((sql) =>
        /FROM (users|devices|scores|email_recovery_requests)\b/i.test(sql),
      ),
    );
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});
test("manually applied 0010 without history requires review instead of replaying duplicate ALTER", async () => {
  const db = fixture();
  try {
    db.prepare("DELETE FROM d1_migrations WHERE name=?").run(
      "0010_course_catalog_operations.sql",
    );
    const report = compare(expected, await capture(sqliteQuery(db)));
    assert.equal(report.schema_and_history_match, false);
    assert.ok(
      report.issues.some(
        (issue) =>
          issue.kind === "history_unrecorded_review" &&
          issue.object.startsWith("0010"),
      ),
    );
    assert.ok(!report.issues.some((issue) => issue.kind === "missing_column"));
    assert.throws(
      () => db.exec(files.find((file) => file.name.startsWith("0010"))!.sql),
      /duplicate column/,
    );
  } finally {
    db.close();
  }
});
test("older schema lists missing columns/tables, missing seed rows, and missing history without creating it", async () => {
  const db = fixture(9);
  try {
    db.exec("DROP TABLE d1_migrations");
    const before = db
      .prepare("SELECT COUNT(*) AS count FROM sqlite_master")
      .get();
    const report = compare(expected, await capture(sqliteQuery(db)));
    assert.ok(
      report.issues.some((issue) => issue.object === "courses.localized_json"),
    );
    assert.ok(
      report.issues.some(
        (issue) => issue.object === "table:golfcore_sync_state",
      ),
    );
    assert.ok(report.issues.some((issue) => issue.kind === "history_missing"));
    assert.deepEqual(
      db.prepare("SELECT COUNT(*) AS count FROM sqlite_master").get(),
      before,
    );
  } finally {
    db.close();
  }
});
test("index/constraint drift, unknown migration and extra trigger are review items", async () => {
  const db = fixture();
  try {
    db.exec(
      "DROP INDEX one_active_device; CREATE INDEX one_active_device ON devices(user_id); CREATE TRIGGER unexpected AFTER UPDATE ON users BEGIN SELECT 1; END;",
    );
    db.prepare("INSERT INTO d1_migrations(name) VALUES(?)").run(
      "9999_unknown.sql",
    );
    const report = compare(expected, await capture(sqliteQuery(db)));
    assert.ok(
      report.issues.some(
        (issue) =>
          issue.object === "index:one_active_device" &&
          issue.kind === "definition_review",
      ),
    );
    assert.ok(
      report.issues.some((issue) => issue.object === "trigger:unexpected"),
    );
    assert.ok(
      report.issues.some((issue) => issue.kind === "unknown_migration_review"),
    );
  } finally {
    db.close();
  }
});
test("queue pauses/cursors are captured and never rewritten; incomplete responses fail closed", async () => {
  const db = fixture();
  try {
    db.exec(
      "UPDATE golfcore_sync_state SET status='paused',next_offset=230 WHERE country_code='PH'",
    );
    const snapshot = await capture(sqliteQuery(db));
    assert.equal(
      snapshot.operations.golfcore_sync_state.find(
        (row) => row.country_code === "PH",
      )?.next_offset,
      230,
    );
    assert.equal(compare(expected, snapshot).schema_and_history_match, true);
    assert.equal(
      db
        .prepare(
          "SELECT status FROM golfcore_sync_state WHERE country_code='PH'",
        )
        .get()?.status,
      "paused",
    );
    let calls = 0;
    await assert.rejects(
      () =>
        capture(async (statements) =>
          ++calls === 1 ? sqliteQuery(db)(statements) : [],
        ),
      /Incomplete/,
    );
  } finally {
    db.close();
  }
});
test("SQL formatting is normalized without changing case-sensitive string literals", () => {
  assert.equal(
    normalizeSQL(
      'CREATE TABLE IF NOT EXISTS "x" ("value" TEXT DEFAULT \'KR\');',
    ),
    normalizeSQL("create table x(value text default 'KR')"),
  );
  assert.notEqual(normalizeSQL("CHECK(x='KR')"), normalizeSQL("CHECK(x='kr')"));
  assert.notEqual(
    normalizeSQL("DEFAULT 'if not exists value'"),
    normalizeSQL("DEFAULT 'value'"),
  );
});
test("local backup restore preserves identity, course PAR, paused sync state, indexes and history", async () => {
  const db = fixture();
  const temp = mkdtempSync(`${tmpdir()}/yamone-restore-`);
  try {
    db.exec(
      "INSERT INTO users(user_id,nickname,personal_code,language,recovery_hash,created_at,updated_at) VALUES('restore-user','Local fixture','RESTORECODE1','ko','fixture-hash',1,1)",
    );
    db.prepare(
      "INSERT INTO courses(course_id,name,region,segments_json,created_by,created_at,updated_at) VALUES('restore-course','Local fixture','','[{\"name\":\"OUT\",\"pars\":[3,4,5,6,7,4,4,4,4]}]','restore-user',1,1)",
    ).run();
    db.exec(
      "UPDATE golfcore_sync_state SET status='paused',next_offset=120 WHERE country_code='KR'",
    );
    const before = await capture(sqliteQuery(db));
    await backup(db, `${temp}/restored.sqlite`);
    const restored = new DatabaseSync(`${temp}/restored.sqlite`, {
      readOnly: true,
    });
    try {
      assert.deepEqual(await capture(sqliteQuery(restored)), before);
      for (const table of ["users", "courses", "golfcore_sync_state"])
        assert.deepEqual(
          restored.prepare(`SELECT * FROM ${table}`).all(),
          db.prepare(`SELECT * FROM ${table}`).all(),
        );
      assert.deepEqual(restored.prepare("PRAGMA foreign_key_check").all(), []);
      assert.equal(
        compare(expected, await capture(sqliteQuery(restored)))
          .schema_and_history_match,
        true,
      );
    } finally {
      restored.close();
    }
    const args = [
      "--import",
      "tsx",
      "scripts/db-preflight.ts",
      "--sqlite",
      `${temp}/restored.sqlite`,
      "--out",
      `${temp}/preflight.json`,
    ];
    const checked = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.equal(checked.status, 0, checked.stderr);
    assert.equal(
      JSON.parse(readFileSync(`${temp}/preflight.json`, "utf8"))
        .schema_and_history_match,
      true,
    );
    assert.equal(statSync(`${temp}/preflight.json`).mode & 0o777, 0o600);
    assert.equal(
      spawnSync(process.execPath, args).status,
      1,
      "An existing report must never be overwritten",
    );
    const unchanged = new DatabaseSync(`${temp}/restored.sqlite`, {
      readOnly: true,
    });
    try {
      assert.equal(
        unchanged.prepare("SELECT COUNT(*) AS count FROM users").get()?.count,
        1,
      );
    } finally {
      unchanged.close();
    }
  } finally {
    db.close();
    rmSync(temp, { recursive: true, force: true });
  }
});
