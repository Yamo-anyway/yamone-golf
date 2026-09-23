import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
let mf: Miniflare;
let db: Awaited<ReturnType<Miniflare["getD1Database"]>>;
async function req(
  path: string,
  token: string,
  value?: unknown,
  method?: string,
) {
  const r = await mf.dispatchFetch("https://api.test" + path, {
    method: method ?? (value === undefined ? "GET" : "POST"),
    headers: {
      Authorization: "Bearer " + token,
      ...(value === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: value === undefined ? undefined : JSON.stringify(value),
  });
  return { status: r.status, data: (await r.json()) as any };
}
async function user() {
  const token = randomBytes(32).toString("hex"),
    key =
      "YMGF" +
      Array.from(
        randomBytes(32),
        (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32],
      ).join("");
  const r = await req("/api/users", token, {
    device_secret: token,
    recovery_key: key,
    nickname: "야모",
  });
  assert.equal(r.status, 201);
  return { token, key, ...r.data.profile };
}
const input = () => ({
  course_id: randomUUID(),
  name: "야모 골프장",
  region: "경기",
  segments: [{ name: "OUT", pars: [4, 4, 3, 5, 4, 4, 3, 5, 4] }],
});
async function course(token: string) {
  const v = input();
  const r = await req("/api/courses", token, v);
  assert.equal(r.status, 201);
  return r.data.course;
}
async function prepare(token: string, c: any, extra = {}) {
  const r = await req("/api/round-actions", token, {
    action_id: randomUUID(),
    kind: "create",
    course_id: c.course_id,
    course_version: c.version,
    segment_indices: [0, 0],
    players: [{ name: "플레이어", self: false }],
    ...extra,
  });
  assert.equal(r.status, 201, JSON.stringify(r));
  return r.data;
}
async function settle(token: string, id: string, outcome = "unavailable") {
  const r = await req("/api/round-actions/" + id + "/ad", token, { outcome });
  assert.equal(r.status, 200, JSON.stringify(r));
}
async function execute(token: string, id: string) {
  return req("/api/round-actions/" + id + "/execute", token, {});
}
async function create(token: string, c: any) {
  const a = await prepare(token, c);
  await settle(token, a.action_id);
  const r = await execute(token, a.action_id);
  assert.equal(r.status, 201, JSON.stringify(r));
  return r.data.round;
}
before(async () => {
  await mkdir(".tmp", { recursive: true });
  await build({
    entryPoints: ["src/index.ts"],
    outfile: ".tmp/score-worker.mjs",
    bundle: true,
    format: "esm",
    platform: "neutral",
  });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      scriptPath: ".tmp/score-worker.mjs",
      compatibilityDate: "2026-09-23",
      d1Databases: ["DB"],
      bindings: { ENVIRONMENT: "test", ALLOWED_ORIGINS: "https://app.test" },
    }),
  );
  db = await mf.getD1Database("DB");
  for (const file of (await readdir("migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const sql = await readFile("migrations/" + file, "utf8");
    await db.batch(
      sql
        .replace(/^--.*$/gm, "")
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => db.prepare(s)),
    );
  }
});
after(async () => {
  await mf?.dispose();
});
beforeEach(async () => {
  await db.batch(
    [
      "receipts",
      "deliveries",
      "score_audit",
      "score_mutations",
      "scores",
      "input_targets",
      "input_target_lists",
      "player_audit",
      "player_mutations",
      "round_ad_settlements",
      "round_actions",
      "round_invitations",
      "player_slots",
      "active_round_users",
      "round_participants",
      "rounds",
      "user_courses",
      "course_lists",
      "courses",
      "recovery_claims",
      "devices",
      "users",
      "request_limits",
      "mutation_guards",
    ].map((t) => db.prepare("DELETE FROM " + t)),
  );
});
async function fixture(count = 3) {
  const a = await user(),
    b = await user(),
    c = await user(),
    courseData = await course(a.token);
  const prepared = await prepare(a.token, courseData, {
    players: Array.from({ length: count }, (_, i) => ({
      name: "플레이어 " + (i + 1),
      self: false,
    })),
  });
  await settle(a.token, prepared.action_id);
  const r = (await execute(a.token, prepared.action_id)).data.round;
  const j = await req("/api/round-actions", b.token, {
    action_id: randomUUID(),
    kind: "join",
    code: r.join_code,
  });
  await settle(b.token, j.data.action_id);
  await execute(b.token, j.data.action_id);
  const path = "/api/rounds/" + r.round_id;
  const roster = (await req(path + "/players", a.token)).data;
  return { a, b, c, r, path, roster, slots: roster.players };
}
async function snapshot(f: any, who = f.a) {
  return (await req(f.path + "/scores", who.token)).data;
}
function write(sheet: any, values: (number | null)[], hole = 1) {
  return {
    mutation_id: randomUUID(),
    hole,
    roster_version: sheet.roster_version,
    target_version: sheet.target_version,
    entries: sheet.slot_ids.map((slot_id: string, i: number) => ({
      slot_id,
      strokes: values[i],
      version:
        sheet.scores.find((s: any) => s.slot_id === slot_id && s.hole === hole)
          ?.version ?? 0,
    })),
  };
}
async function save(f: any, b: any, who = f.a) {
  return req(f.path + "/scores", who.token, b, "PUT");
}
const strokes = (sheet: any, hole = 1) =>
  sheet.slot_ids.map(
    (id: string) =>
      sheet.scores.find((s: any) => s.slot_id === id && s.hole === hole)
        ?.strokes ?? null,
  );
test("new scores are absent, never zero; full-hole save, edit and null deletion retain revisions", async () => {
  const f = await fixture(),
    s = await snapshot(f);
  assert.deepEqual(s.scores, []);
  const first = await save(f, write(s, [4, 5, 3]));
  assert.equal(first.status, 200, JSON.stringify(first));
  assert.deepEqual(strokes(first.data.sheet), [4, 5, 3]);
  const changed = await save(f, write(first.data.sheet, [5, 5, 3]));
  assert.equal(changed.status, 200);
  assert.equal(
    changed.data.sheet.scores.find((s: any) => s.slot_id === f.slots[0].slot_id)
      .version,
    2,
  );
  const cleared = await save(f, write(changed.data.sheet, [null, null, null]));
  assert.equal(cleared.status, 200);
  assert.deepEqual(strokes(cleared.data.sheet), [null, null, null]);
  assert.ok(cleared.data.sheet.scores.every((s: any) => s.version >= 2));
  assert.equal(
    (await db.prepare("SELECT count(*) n FROM score_audit").first<any>())!.n,
    7,
  );
});
test("stale different scores reject the entire hole, latest confirmation is versioned and can conflict again", async () => {
  const f = await fixture(),
    initial = await snapshot(f);
  const desired = write(initial, [5, 6, 7]);
  let result = await save(f, write(initial, [4, 4, 4]), f.b);
  assert.equal(result.status, 200);
  const conflict = await save(f, desired);
  assert.equal(conflict.status, 409);
  assert.equal(conflict.data.error, "score_conflict");
  assert.equal(conflict.data.conflicts.length, 3);
  assert.deepEqual(strokes(await snapshot(f)), [4, 4, 4]);
  desired.entries = desired.entries.map((e: any) => ({
    ...e,
    version: conflict.data.conflicts.find((c: any) => c.slot_id === e.slot_id)
      .version,
  }));
  result = await save(f, write(result.data.sheet, [8, 4, 4]), f.b);
  const again = await save(f, { ...desired, mutation_id: randomUUID() });
  assert.equal(again.status, 409);
  assert.equal(again.data.conflicts.length, 1);
  assert.equal(again.data.conflicts[0].strokes, 8);
  assert.deepEqual(strokes(await snapshot(f)), [8, 4, 4]);
  desired.entries[0].version = again.data.conflicts[0].version;
  assert.equal(
    (await save(f, { ...desired, mutation_id: randomUUID() })).status,
    200,
  );
  assert.deepEqual(strokes(await snapshot(f)), [5, 6, 7]);
});
test("equal stale values are no-ops and do not extend round activity or add audit entries", async () => {
  const f = await fixture(),
    s = await snapshot(f);
  const first = await save(f, write(s, [4, 4, 4]));
  await db
    .prepare("UPDATE rounds SET updated_at=123 WHERE round_id=?")
    .bind(f.r.round_id)
    .run();
  const same = await save(f, write(s, [4, 4, 4]), f.b);
  assert.equal(same.status, 200);
  assert.deepEqual(same.data.sheet.scores, first.data.sheet.scores);
  assert.equal(
    (await db
      .prepare("SELECT updated_at FROM rounds WHERE round_id=?")
      .bind(f.r.round_id)
      .first<any>())!.updated_at,
    123,
  );
  assert.equal(
    (await db.prepare("SELECT count(*) n FROM score_audit").first<any>())!.n,
    3,
  );
});
test("parallel unequal writers commit one complete hole; equal writers both succeed without duplicate revisions", async () => {
  const f = await fixture(),
    s = await snapshot(f);
  const r = await Promise.all([
    save(f, write(s, [4, 4, 4])),
    save(f, write(s, [5, 5, 5]), f.b),
  ]);
  assert.deepEqual(r.map((x) => x.status).sort(), [200, 409]);
  const winner = strokes(await snapshot(f));
  assert.ok(winner.every((v: any) => v === winner[0]));
  const second = await Promise.all([
    save(f, write(s, [3, 3, 3], 2)),
    save(f, write(s, [3, 3, 3], 2), f.b),
  ]);
  assert.deepEqual(
    second.map((x) => x.status),
    [200, 200],
  );
  assert.ok(
    (await snapshot(f)).scores
      .filter((x: any) => x.hole === 2)
      .every((x: any) => x.version === 1),
  );
});
test("ABA changes and deletion tombstones cannot be overwritten using a stale revision", async () => {
  const f = await fixture(),
    initial = await snapshot(f);
  let s = (await save(f, write(initial, [4, 4, 4]))).data.sheet;
  const old = s;
  s = (await save(f, write(s, [5, 4, 4]))).data.sheet;
  s = (await save(f, write(s, [4, 4, 4]))).data.sheet;
  assert.equal(
    (await save(f, write(old, [6, 4, 4]))).data.error,
    "score_conflict",
  );
  s = (await save(f, write(s, [null, 4, 4]))).data.sheet;
  const result = await save(f, write(initial, [7, 4, 4]));
  assert.equal(result.status, 409);
  assert.equal(result.data.conflicts[0].strokes, null);
  assert.equal((await save(f, write(old, [null, null, null]))).status, 200); // already-null row is harmless; other rows are unchanged since old
});
test("lost responses and concurrent retries execute once; request IDs cannot be reused for other content", async () => {
  const f = await fixture(),
    s = await snapshot(f),
    b = write(s, [4, 5, 6]);
  const replies = await Promise.all([save(f, b), save(f, b), save(f, b)]);
  assert.ok(
    replies.every((r) => r.status === 200),
    JSON.stringify(replies),
  );
  assert.equal(
    (await db.prepare("SELECT count(*) n FROM score_mutations").first<any>())!
      .n,
    1,
  );
  assert.equal(
    (await db.prepare("SELECT count(*) n FROM score_audit").first<any>())!.n,
    3,
  );
  let newer = (await save(f, write(await snapshot(f), [8, 5, 6]), f.b)).data
    .sheet;
  const replay = await save(f, b);
  assert.equal(replay.status, 200);
  assert.equal(replay.data.replayed, true);
  assert.deepEqual(strokes(replay.data.sheet), strokes(newer));
  assert.equal((await save(f, { ...b, hole: 2 })).data.error, "request_reused");
});
test("only current selected players can be written; selection revisions protect old drafts and other players", async () => {
  const f = await fixture(),
    s = await snapshot(f),
    old = write(s, [4, 5, 6]);
  let r = await req(
    f.path + "/input-targets",
    f.a.token,
    {
      mutation_id: randomUUID(),
      version: 0,
      roster_version: s.roster_version,
      slot_ids: [s.slot_ids[1]],
    },
    "PATCH",
  );
  assert.equal(r.status, 200);
  assert.equal((await save(f, old)).data.error, "targets_changed");
  const selected = await snapshot(f);
  assert.equal((await save(f, write(selected, [5]))).status, 200);
  const other = await snapshot(f, f.b);
  assert.deepEqual(strokes(other), [null, 5, null]);
  assert.equal((await save(f, write(await snapshot(f), [null]))).status, 200);
  assert.deepEqual(strokes(await snapshot(f, f.b)), [null, null, null]);
  assert.equal(
    (
      await save(f, {
        ...write(await snapshot(f), [5]),
        entries: [{ slot_id: s.slot_ids[0], strokes: 4, version: 0 }],
      })
    ).status,
    409,
  );
});
test("rejects malformed, zero, negative, duplicate, foreign slots and out-of-range holes", async () => {
  const f = await fixture(),
    s = await snapshot(f),
    base = write(s, [4, 4, 4]);
  for (const value of [0, -1, 1.5, 1000, "4", undefined]) {
    const b = structuredClone(base);
    b.entries[0].strokes = value as any;
    assert.equal((await save(f, b)).status, 400);
  }
  for (const hole of [0, 19, 1.2, "1"])
    assert.equal((await save(f, { ...base, hole })).status, 400);
  assert.equal(
    (await save(f, { ...base, entries: [base.entries[0], base.entries[0]] }))
      .status,
    400,
  );
  const foreign = structuredClone(base);
  foreign.entries[0].slot_id = randomUUID();
  assert.equal((await save(f, foreign)).status, 409);
  await db
    .prepare("UPDATE rounds SET hole_count=9 WHERE round_id=?")
    .bind(f.r.round_id)
    .run();
  assert.equal((await save(f, { ...base, hole: 10 })).status, 400);
  assert.deepEqual((await snapshot(f)).scores, []);
});
test("nonparticipants, moved devices, ended rounds and deleted players cannot mutate scores", async () => {
  const f = await fixture(),
    s = await snapshot(f),
    b = write(s, [4, 4, 4]);
  assert.equal((await req(f.path + "/scores", f.c.token)).status, 403);
  assert.equal((await save(f, b, f.c)).status, 403);
  await db
    .prepare("UPDATE player_slots SET deleted_at=1 WHERE slot_id=?")
    .bind(s.slot_ids[0])
    .run();
  assert.equal((await save(f, b)).status, 409);
  await db
    .prepare("UPDATE rounds SET status='ended',ended_at=1 WHERE round_id=?")
    .bind(f.r.round_id)
    .run();
  assert.equal((await save(f, b)).data.error, "round_ended");
  assert.equal((await req(f.path + "/scores", f.a.token)).status, 200);
  await db
    .prepare("UPDATE devices SET revoked_at=1 WHERE user_id=?")
    .bind(f.a.user_id)
    .run();
  assert.equal((await save(f, b)).data.error, "device_moved");
});
test("trusted web origins can preflight PUT score saves", async () => {
  const r = await mf.dispatchFetch(
    "https://api.test/api/rounds/example/scores",
    {
      method: "OPTIONS",
      headers: {
        Origin: "https://app.test",
        "Access-Control-Request-Method": "PUT",
        "Access-Control-Request-Headers": "Content-Type",
      },
    },
  );
  assert.equal(r.status, 204);
  assert.ok(
    r.headers.get("Access-Control-Allow-Methods")?.split(", ").includes("PUT"),
  );
});
