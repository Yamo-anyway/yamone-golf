import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import worker from "../src/index";
import { normalizeGolfCoreCourse } from "../src/course-admin";
import type { Env } from "../src/shared";
import { ADMIN_COUNTRIES, WORLD_COUNTRY_CODES } from "../../shared/countries";
import { countryLabels } from "../../shared/country-labels";
let db: DatabaseSync,
  env: Env,
  token = "",
  mode = "valid",
  sourceVersion = 1;
const admin = "course-data-local-admin-token-long-enough-123456",
  calls: string[] = [];
const migrationDir = new URL("../migrations/", import.meta.url);
class Prepared {
  constructor(
    readonly sql: string,
    readonly args: unknown[] = [],
  ) {}
  bind(...args: unknown[]) {
    return new Prepared(this.sql, args);
  }
  async first(column?: string) {
    const row = db
      .prepare(this.sql)
      .get(...(this.args as (string | number | null)[]));
    return column ? (row?.[column] ?? null) : (row ?? null);
  }
  async all() {
    return {
      success: true,
      results: db
        .prepare(this.sql)
        .all(...(this.args as (string | number | null)[])),
    };
  }
  async run() {
    const r = db
      .prepare(this.sql)
      .run(...(this.args as (string | number | null)[]));
    return { success: true, meta: { changes: Number(r.changes) } };
  }
}
function detail(slug: string) {
  return {
    slug,
    name: (sourceVersion === 1 ? "Source " : "Changed ") + slug,
    country: slug.slice(0, 2),
    city: "Yongin",
    address: "Address " + sourceVersion,
    coverage: { scorecard: true },
    layouts: [
      {
        name: "OUT",
        holes: Array.from({ length: 9 }, (_, i) => ({
          position: i + 1,
          par: 4,
        })),
      },
    ],
  };
}
async function api(
  path: string,
  method = "GET",
  value?: unknown,
  asAdmin = true,
  headers: Record<string, string> = {},
) {
  const r = await worker.fetch(
    new Request("https://test.local" + path, {
      method,
      headers: {
        Authorization: "Bearer " + (asAdmin ? admin : token),
        ...(value === undefined ? {} : { "Content-Type": "application/json" }),
        ...headers,
      },
      body: value === undefined ? undefined : JSON.stringify(value),
    }),
    env,
  );
  return { status: r.status, data: (await r.json()) as any };
}
async function manual(country = "KR", name = "Original Club") {
  const r = await api("/admin/api/courses", "POST", {
    name,
    country_code: country,
    city: country === "KR" ? "Yongin" : "Manila",
    segments: [{ name: "OUT", pars: Array(9).fill(4) }],
    localization: {
      name: { ko: "원래 골프장", en: name, local: "" },
      address: { ko: "", en: "", local: "" },
    },
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.course;
}
async function prepare(c: any) {
  const r = await api(
    "/api/round-actions",
    "POST",
    {
      action_id: randomUUID(),
      kind: "create",
      course_id: c.course_id,
      course_version: c.version,
      segment_indices: [0],
      players: [{ name: "Yamo", self: true }],
    },
    false,
  );
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(
    (
      await api(
        "/api/round-actions/" + r.data.action_id + "/ad",
        "POST",
        { outcome: "unavailable" },
        false,
      )
    ).status,
    200,
  );
  return r.data.action_id;
}
beforeEach(async () => {
  db = new DatabaseSync(":memory:");
  for (const f of readdirSync(migrationDir)
    .filter((f) => f.endsWith(".sql"))
    .sort())
    db.exec(readFileSync(new URL(f, migrationDir), "utf8"));
  db.exec("PRAGMA foreign_keys=ON");
  mode = "valid";
  sourceVersion = 1;
  calls.length = 0;
  const database = {
    prepare: (sql: string) => new Prepared(sql),
    batch: async (statements: Prepared[]) => {
      db.exec("BEGIN");
      try {
        const r = [];
        for (const s of statements) r.push(await s.run());
        db.exec("COMMIT");
        return r;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
  env = {
    DB: database,
    ENVIRONMENT: "test",
    COURSE_ADMIN_TOKEN: admin,
    GOLFCORE_API: {
      fetch: async (request: Request) => {
        const url = new URL(request.url);
        calls.push(url.pathname + url.search);
        if (mode === "unavailable")
          return new Response("unavailable", { status: 503 });
        if (url.pathname.endsWith("/courses")) {
          const cc = url.searchParams.get("country")!;
          const courses: unknown[] = [detail(cc + "-one"), detail(cc + "-two")];
          if (mode === "invalid-page") courses[1] = null;
          return Response.json({ total: 2, courses });
        }
        if (mode === "summary-only")
          return new Response("unavailable", { status: 503 });
        return Response.json(detail(url.pathname.split("/").at(-1)!));
      },
    },
  } as unknown as Env;
  token = randomBytes(32).toString("hex");
  const r = await api(
    "/api/users",
    "POST",
    {
      nickname: "Yamo",
      language: "en",
      device_secret: token,
      recovery_key: "YMGF" + "ABCDEFGH".repeat(4),
      client: "native",
    },
    false,
  );
  assert.equal(r.status, 201, JSON.stringify(r.data));
});
afterEach(() => db.close());
test("missing sync queues are seeded once, preserving cursor/priority/pause", () => {
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM golfcore_sync_state").get()!.n,
    9,
  );
  db.exec(
    "DELETE FROM golfcore_sync_state WHERE country_code='KR';UPDATE golfcore_sync_state SET status='paused',priority=99,next_offset=120,updated_at=123 WHERE country_code='PH'",
  );
  const sql = readFileSync(
    new URL("0012_golfcore_sync_queue.sql", migrationDir),
    "utf8",
  );
  db.exec(sql);
  db.exec(sql);
  const row = db
    .prepare("SELECT * FROM golfcore_sync_state WHERE country_code='PH'")
    .get()!;
  assert.equal(row.status, "paused");
  assert.equal(row.priority, 99);
  assert.equal(row.next_offset, 120);
  assert.equal(row.updated_at, 123);
  assert.equal(
    db
      .prepare(
        "SELECT priority FROM golfcore_sync_state WHERE country_code='KR'",
      )
      .get()!.priority,
    100,
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM golfcore_sync_state").get()!.n,
    9,
  );
  assert.deepEqual(
    db
      .prepare(
        "SELECT country_code FROM golfcore_sync_state ORDER BY country_code",
      )
      .all()
      .map((r) => r.country_code),
    ADMIN_COUNTRIES.map((c) => c.code).sort(),
  );
});
test("scheduled collection advances beyond PH and never publishes raw rows", async () => {
  env.ENVIRONMENT = "development";
  db.exec(
    "INSERT INTO golfcore_sync_state(country_code,priority) VALUES('KH',-1)",
  );
  await worker.scheduled({} as ScheduledController, env);
  await worker.scheduled({} as ScheduledController, env);
  assert.deepEqual(
    calls
      .filter((x) => x.startsWith("/v1/courses?"))
      .map((x) => new URL("https://test" + x).searchParams.get("country")),
    ["kr", "ph"],
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM golfcore_catalog_courses").get()!.n,
    4,
  );
  assert.equal(db.prepare("SELECT COUNT(*) n FROM courses").get()!.n, 0);
  assert.equal(
    db
      .prepare("SELECT status FROM golfcore_sync_state WHERE country_code='JP'")
      .get()!.status,
    "pending",
  );
});
test("invalid upstream rows hold the cursor instead of completing a partial page", async () => {
  mode = "invalid-page";
  const failed = await api("/admin/api/golfcore/sync", "POST", {
    country_code: "KR",
  });
  assert.equal(failed.status, 502);
  const state = db
    .prepare(
      "SELECT next_offset,status FROM golfcore_sync_state WHERE country_code='KR'",
    )
    .get()!;
  assert.equal(state.next_offset, 0);
  assert.equal(state.status, "error");
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM golfcore_catalog_courses").get()!.n,
    0,
  );
  mode = "valid";
  assert.equal(
    (await api("/admin/api/golfcore/sync", "POST", { country_code: "KR" }))
      .status,
    200,
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM golfcore_catalog_courses").get()!.n,
    2,
  );
});
test("retry fills missing detail and collection preserves curated public edits", async () => {
  mode = "summary-only";
  assert.equal(
    (await api("/admin/api/golfcore/sync", "POST", { country_code: "KR" }))
      .status,
    200,
  );
  assert.equal(
    db
      .prepare(
        "SELECT detail_state FROM golfcore_catalog_courses WHERE slug='kr-one'",
      )
      .get()!.detail_state,
    "summary",
  );
  mode = "valid";
  await api("/admin/api/golfcore/sync", "POST", { country_code: "KR" });
  const imported = await api("/admin/api/golfcore/import", "POST", {
    slug: "kr-one",
  });
  assert.equal(imported.status, 201, JSON.stringify(imported.data));
  const c = imported.data.course;
  const edited = await api("/admin/api/courses/" + c.course_id, "PUT", {
    ...c,
    name: "Curated Club",
    segments: [{ name: "OUT", pars: [5, 4, 4, 4, 4, 4, 4, 4, 4] }],
    localization: {
      name: { ko: "검토한 골프장", en: "Curated Club", local: "" },
      address: { ko: "검토 주소", en: "Reviewed address", local: "" },
    },
  });
  assert.equal(edited.status, 200, JSON.stringify(edited.data));
  const before = db
    .prepare(
      "SELECT name,segments_json,localized_json,version FROM courses WHERE course_id=?",
    )
    .get(c.course_id);
  sourceVersion = 2;
  await api("/admin/api/golfcore/sync", "POST", { country_code: "KR" });
  assert.deepEqual(
    db
      .prepare(
        "SELECT name,segments_json,localized_json,version FROM courses WHERE course_id=?",
      )
      .get(c.course_id),
    before,
  );
  assert.equal(
    db
      .prepare("SELECT name FROM golfcore_catalog_courses WHERE slug='kr-one'")
      .get()!.name,
    "Changed kr-one",
  );
  const again = await api("/admin/api/golfcore/import", "POST", {
    ...edited.data.course,
    slug: "kr-one",
  });
  assert.equal(again.status, 200, JSON.stringify(again.data));
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) n FROM courses WHERE source_external_id='kr-one'",
      )
      .get()!.n,
    1,
  );
});
test("localized country search, managed edit lock and worldwide user registration", async () => {
  const kr = await manual("KR", "Lake Club"),
    ph = await manual("PH", "Lake Club");
  const r = await api(
    "/api/courses",
    "POST",
    {
      course_id: randomUUID(),
      name: "Vientiane Club",
      region: "Vientiane",
      country_code: "LA",
      segments: [{ name: "OUT", pars: Array(9).fill(4) }],
    },
    false,
  );
  assert.equal(r.status, 201, JSON.stringify(r.data));
  for (const cc of ["KR", "PH", "LA"]) {
    const r = await api("/api/courses?country=" + cc, "GET", undefined, false);
    assert.equal(r.status, 200);
    assert.equal(r.data.courses.length, 1);
    assert.equal(r.data.courses[0].country_code, cc);
  }
  const korean = await api(
    "/api/courses?country=KR&q=" + encodeURIComponent("원래 골프장"),
    "GET",
    undefined,
    false,
    { "X-Device-Region": "KR" },
  );
  assert.equal(korean.data.courses[0].display_name, "원래 골프장(Lake Club)");
  const english = await api(
    "/api/courses/" + kr.course_id,
    "GET",
    undefined,
    false,
    { "X-Device-Region": "US" },
  );
  assert.equal(english.data.course.display_name, "Lake Club(원래 골프장)");
  assert.equal(
    (await api("/api/courses?country=ZZ", "GET", undefined, false)).status,
    400,
  );
  assert.equal(
    (await api("/api/courses/" + ph.course_id, "PATCH", ph, false)).status,
    403,
  );
  const keyOnly = await api(
    "/api/courses?country=KR&q=local",
    "GET",
    undefined,
    false,
  );
  assert.equal(
    keyOnly.data.courses.length,
    0,
    "JSON field names must not match the search",
  );
  assert.equal(
    (await api("/admin/api/courses?country=KR&q=local")).data.total_count,
    0,
  );
  for (const cc of WORLD_COUNTRY_CODES) {
    assert.ok(countryLabels[cc]?.ko);
    assert.ok(countryLabels[cc]?.en);
  }
  assert.ok(
    WORLD_COUNTRY_CODES.includes("KH") && WORLD_COUNTRY_CODES.includes("LA"),
  );
});
test("admin changes reach search while inactive courses preserve round snapshots", async () => {
  const c = await manual(),
    id = await prepare(c);
  const started = await api(
    "/api/round-actions/" + id + "/execute",
    "POST",
    {},
    false,
  );
  assert.equal(started.status, 201, JSON.stringify(started.data));
  const snapshot = db
    .prepare("SELECT course_snapshot FROM rounds WHERE round_id=?")
    .get(started.data.round.round_id)!.course_snapshot;
  const edited = await api("/admin/api/courses/" + c.course_id, "PUT", {
    ...c,
    name: "Updated Club",
    localization: {
      name: { ko: "수정한 골프장", en: "Updated Club", local: "" },
      address: { ko: "", en: "", local: "" },
    },
    segments: [{ name: "OUT", pars: Array(9).fill(5) }],
  });
  assert.equal(edited.status, 200);
  const search = await api("/api/courses?q=Updated", "GET", undefined, false);
  assert.equal(search.data.courses[0].segments[0].pars[0], 5);
  await api("/admin/api/courses/" + c.course_id, "PUT", {
    ...edited.data.course,
    active: false,
  });
  assert.equal(
    (await api("/api/courses", "GET", undefined, false)).data.courses.length,
    0,
  );
  assert.equal(
    db
      .prepare("SELECT course_snapshot FROM rounds WHERE round_id=?")
      .get(started.data.round.round_id)!.course_snapshot,
    snapshot,
  );
  const old = await api(
    "/api/rounds/" + started.data.round.round_id,
    "GET",
    undefined,
    false,
  );
  assert.equal(old.data.round.course.name, "Original Club");
  assert.equal(old.data.round.course.segments[0].pars[0], 4);
});
test("prepared round rechecks course availability after ads and keeps its settlement", async () => {
  const c = await manual(),
    id = await prepare(c);
  assert.equal(
    (
      await api("/admin/api/courses/" + c.course_id, "PUT", {
        ...c,
        active: false,
      })
    ).status,
    200,
  );
  assert.equal(
    (await api("/api/round-actions/" + id + "/execute", "POST", {}, false))
      .status,
    404,
  );
  assert.equal(db.prepare("SELECT COUNT(*) n FROM rounds").get()!.n, 0);
  assert.ok(
    db
      .prepare("SELECT ad_settled_at FROM round_actions WHERE action_id=?")
      .get(id)!.ad_settled_at,
  );
});
test("disabled-country registration and update fail before any write", async () => {
  const c = await api(
    "/api/courses",
    "POST",
    {
      course_id: randomUUID(),
      name: "User Club",
      region: "",
      country_code: "KR",
      segments: [{ name: "OUT", pars: Array(9).fill(4) }],
    },
    false,
  );
  assert.equal(c.status, 201);
  db.exec(
    "UPDATE country_course_settings SET enabled=0 WHERE country_code='PH'",
  );
  assert.equal(
    (
      await api(
        "/api/courses",
        "POST",
        { ...c.data.course, course_id: randomUUID(), country_code: "PH" },
        false,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await api(
        "/api/courses/" + c.data.course.course_id,
        "PATCH",
        { ...c.data.course, country_code: "PH" },
        false,
      )
    ).status,
    403,
  );
  const row = db.prepare("SELECT country_code,version FROM courses").get()!;
  assert.equal(row.country_code, "KR");
  assert.equal(row.version, 1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM courses").get()!.n, 1);
  const batch = env.DB.batch.bind(env.DB);
  let changed = false;
  env.DB.batch = (async (statements: unknown[]) => {
    if (!changed) {
      changed = true;
      db.exec(
        "UPDATE country_course_settings SET enabled=0 WHERE country_code='JP'",
      );
    }
    return batch(statements as D1PreparedStatement[]);
  }) as typeof env.DB.batch;
  const race = await api(
    "/api/courses",
    "POST",
    { ...c.data.course, course_id: randomUUID(), country_code: "JP" },
    false,
  );
  assert.equal(race.status, 409, JSON.stringify(race.data));
  assert.equal(db.prepare("SELECT COUNT(*) n FROM courses").get()!.n, 1);
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM mutation_guards").get()!.n,
    0,
  );
});
test("read-only quality audit identifies PAR/translation/region and duplicate candidates", async () => {
  const a = await manual("KR", "Same Club"),
    b = await manual("KR", " same club ");
  await manual("PH", "Same Club");
  db.prepare(
    "UPDATE courses SET segments_json=?,localized_json='{}',city='unknown' WHERE course_id=?",
  ).run(
    JSON.stringify([{ name: "OUT", pars: [8, 4, 4, 4, 4, 4, 4, 4, 4] }]),
    a.course_id,
  );
  const before = db.prepare("SELECT * FROM courses ORDER BY course_id").all(),
    r = await api("/admin/api/courses/audit?country=KR");
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.complete, true);
  assert.equal(r.data.checked, 2);
  assert.equal(r.data.counts.invalid_par, 1);
  assert.equal(r.data.counts.region_unclassified, 1);
  assert.equal(r.data.counts.translation_missing, 1);
  assert.equal(r.data.duplicate_groups, 1);
  assert.deepEqual(
    new Set(r.data.duplicates[0].courses.map((c: any) => c.course_id)),
    new Set([a.course_id, b.course_id]),
  );
  assert.deepEqual(
    db.prepare("SELECT * FROM courses ORDER BY course_id").all(),
    before,
  );
  assert.equal((await api("/admin/api/courses/audit?country=ZZ")).status, 400);
  assert.equal(
    (await api("/admin/api/courses/audit", "GET", undefined, false)).status,
    401,
  );
});

test("invalid holes cannot be filtered into a falsely complete nine-hole scorecard", () => {
  const base = detail("kr-invalid");
  for (const holes of [
    Array.from({ length: 18 }, (_, i) => ({
      position: i + 1,
      par: i < 9 ? 4 : 8,
    })),
    [...base.layouts[0].holes, { position: 10, par: 8 }],
    base.layouts[0].holes.map((h, i) =>
      i === 8 ? { position: 8, par: 4 } : h,
    ),
  ])
    assert.throws(() =>
      normalizeGolfCoreCourse({ ...base, layouts: [{ name: "OUT", holes }] }),
    );
  const valid = normalizeGolfCoreCourse({
    ...base,
    layouts: [
      {
        name: "OUT",
        holes: base.layouts[0].holes.map((h, i) => ({
          ...h,
          par: [3, 4, 5, 6, 7, 4, 4, 4, 4][i],
        })),
      },
    ],
  }) as { segments: { pars: number[] }[] };
  assert.deepEqual(valid.segments[0].pars, [3, 4, 5, 6, 7, 4, 4, 4, 4]);
});
test("deactivation between precheck and transaction cannot create a new round", async () => {
  const c = await manual(),
    id = await prepare(c);
  const batch = env.DB.batch.bind(env.DB);
  let intercepted = false;
  env.DB.batch = (async (statements: unknown[]) => {
    if (!intercepted) {
      intercepted = true;
      db.prepare("UPDATE courses SET active=0 WHERE course_id=?").run(
        c.course_id,
      );
    }
    return batch(statements as D1PreparedStatement[]);
  }) as typeof env.DB.batch;
  const r = await api(
    "/api/round-actions/" + id + "/execute",
    "POST",
    {},
    false,
  );
  assert.equal(r.status, 404, JSON.stringify(r.data));
  assert.equal(db.prepare("SELECT COUNT(*) n FROM rounds").get()!.n, 0);
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM mutation_guards").get()!.n,
    0,
  );
});
