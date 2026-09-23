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
    outfile: ".tmp/ending-worker.mjs",
    bundle: true,
    format: "esm",
    platform: "neutral",
  });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      scriptPath: ".tmp/ending-worker.mjs",
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
      "round_lifecycle_mutations",
      "round_completions",
      "round_endings",
      "record_mutations",
      "round_ad_settlements",
      "receipt_actions",
      "receipts",
      "deliveries",
      "score_audit",
      "score_mutations",
      "scores",
      "input_targets",
      "input_target_lists",
      "player_audit",
      "player_mutations",
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
const SIX_HOURS = 21600000;
const ending = async (f: any, who = f.a) =>
  (await req(f.path + "/ending", who.token)).data;
async function end(f: any, who = f.a, data?: any) {
  return req(
    f.path + "/ending",
    who.token,
    data ?? {
      user_id: who.user_id,
      mutation_id: randomUUID(),
      record_version: (await ending(f, who)).record_version,
    },
  );
}
async function permission(
  f: any,
  who: any,
  target: any,
  allowed: boolean,
  extra = {},
) {
  return req(f.path + "/end-permissions", who.token, {
    user_id: who.user_id,
    mutation_id: randomUUID(),
    permission_version: (await ending(f, who)).permission_version,
    participant_id: target.user_id,
    can_end: allowed,
    ...extra,
  });
}
test("only creator delegates; revocation, stale permission edits and device/user boundaries are enforced", async () => {
  const f = await fixture();
  assert.equal((await end(f, f.b)).data.error, "end_forbidden");
  assert.equal((await end(f, f.c)).status, 403);
  assert.equal((await permission(f, f.b, f.a, true)).status, 403);
  assert.equal(
    (await permission(f, f.a, f.c, true)).data.error,
    "invalid_participant",
  );
  assert.equal(
    (await permission(f, f.a, f.a, false)).data.error,
    "invalid_participant",
  );
  const before = await ending(f);
  assert.equal((await permission(f, f.a, f.b, true)).status, 200);
  assert.equal((await ending(f, f.b)).can_end, true);
  assert.equal((await ending(f)).updated_at, before.updated_at);
  assert.equal(
    (
      await permission(f, f.a, f.b, false, {
        permission_version: before.permission_version,
      })
    ).data.error,
    "permissions_changed",
  );
  await permission(f, f.a, f.b, false);
  assert.equal((await end(f, f.b)).data.error, "end_forbidden");
  const body = {
    user_id: f.a.user_id,
    mutation_id: randomUUID(),
    record_version: before.record_version,
  };
  assert.equal((await end(f, f.b, body)).data.error, "user_changed");
  await db
    .prepare("UPDATE devices SET revoked_at=? WHERE user_id=?")
    .bind(Date.now(), f.a.user_id)
    .run();
  assert.equal((await end(f, f.a, body)).status, 401);
});
test("delegated ending preserves data, snapshots completion, cancels invites and frees every participant without another ad", async () => {
  const f = await fixture(2);
  await req(f.path + "/invitations", f.a.token, {
    invitation_id: randomUUID(),
    personal_code: f.c.personal_code,
  });
  for (let h = 1; h <= 18; h++) {
    const sheet = await snapshot(f);
    assert.equal(
      (await save(f, write(sheet, [4, h <= 8 ? 5 : null], h))).status,
      200,
    );
  }
  await permission(f, f.a, f.b, true);
  const response = await end(f, f.b);
  assert.equal(response.status, 200);
  assert.equal(response.data.reason, "manual");
  assert.equal(response.data.ended_by, f.b.user_id);
  assert.deepEqual(
    response.data.players.map((p: any) => [p.holes_recorded, p.complete]),
    [
      [18, true],
      [8, false],
    ],
  );
  assert.equal(
    (
      await db
        .prepare("SELECT COUNT(*) n FROM scores WHERE strokes IS NOT NULL")
        .first<any>()
    ).n,
    26,
  );
  assert.equal(
    (await db.prepare("SELECT COUNT(*) n FROM active_round_users").first<any>())
      .n,
    0,
  );
  assert.equal(
    (await db.prepare("SELECT status FROM round_invitations").first<any>())
      .status,
    "cancelled",
  );
  assert.equal(
    (
      await db
        .prepare("SELECT COUNT(*) n FROM round_ad_settlements")
        .first<any>()
    ).n,
    2,
  );
  for (const who of [f.a, f.b]) {
    const home = (await req("/api/home", who.token)).data;
    assert.equal(home.active_round, null);
    assert.equal(home.ended_rounds[0].round_id, f.r.round_id);
    assert.equal(
      (await create(who.token, await course(who.token))).status,
      "active",
    );
  }
  assert.equal((await req("/api/home", f.c.token)).data.invitations.length, 0);
  assert.equal(
    (await save(f, write(await snapshot(f), [5, 5]))).data.error,
    "round_ended",
  );
});
test("changed score, roster and participant revisions require fresh ending confirmation; equal saves do not", async () => {
  const f = await fixture(1),
    original = await ending(f);
  const body = {
    user_id: f.a.user_id,
    mutation_id: randomUUID(),
    record_version: original.record_version,
  };
  await save(f, write(await snapshot(f), [4]));
  assert.equal((await end(f, f.a, body)).data.error, "end_changed");
  const saved = await ending(f);
  await save(f, write(await snapshot(f), [4]));
  assert.equal((await ending(f)).record_version, saved.record_version);
  const renamed = await req(
    f.path + "/players/" + f.slots[0].slot_id,
    f.a.token,
    {
      mutation_id: randomUUID(),
      action: "rename",
      name: "다른 이름",
      version: f.slots[0].version,
    },
    "PATCH",
  );
  assert.equal(renamed.status, 200, JSON.stringify(renamed));
  assert.equal(
    (await end(f, f.a, { ...body, record_version: saved.record_version })).data
      .error,
    "end_changed",
  );
  const current = await ending(f);
  const pending = await req("/api/round-actions", f.c.token, {
    action_id: randomUUID(),
    kind: "join",
    code: f.r.join_code,
  });
  await settle(f.c.token, pending.data.action_id);
  await execute(f.c.token, pending.data.action_id);
  assert.equal(
    (await end(f, f.a, { ...body, record_version: current.record_version }))
      .data.error,
    "end_changed",
  );
});
test("parallel ending and replay are idempotent; request reuse cannot change its content", async () => {
  const f = await fixture(),
    state = await ending(f);
  const body = {
    user_id: f.a.user_id,
    mutation_id: randomUUID(),
    record_version: state.record_version,
  };
  const results = await Promise.all([end(f, f.a, body), end(f, f.a, body)]);
  assert.ok(results.every((r) => r.status === 200));
  assert.equal(
    (await end(f, f.a, body)).data.ended_at,
    results[0].data.ended_at,
  );
  assert.equal(
    (await end(f, f.a, { ...body, record_version: state.record_version + 1 }))
      .data.error,
    "request_reused",
  );
  assert.equal(
    (await db.prepare("SELECT COUNT(*) n FROM round_endings").first<any>()).n,
    1,
  );
  assert.equal(
    (
      await db
        .prepare(
          "SELECT COUNT(*) n FROM round_lifecycle_mutations WHERE kind='end'",
        )
        .first<any>()
    ).n,
    1,
  );
});
test("scheduled inactivity ending uses activity+6h, independently snapshots each player and ignores fresh rounds", async () => {
  const f = await fixture(2);
  // Full one-player 18-hole record and another player's explicit nulls.
  for (let h = 1; h <= 18; h++)
    await save(f, write(await snapshot(f), [4, null], h));
  const fresh = await create(f.c.token, await course(f.c.token));
  const at = Date.now() - SIX_HOURS - 1000;
  await db
    .prepare("UPDATE rounds SET updated_at=? WHERE round_id=?")
    .bind(at, f.r.round_id)
    .run();
  const worker = await mf.getWorker();
  await worker.scheduled({ cron: "*/10 * * * *", scheduledTime: Date.now() });
  const ended = await ending(f);
  assert.equal(ended.reason, "inactivity");
  assert.equal(ended.ended_at, at + SIX_HOURS);
  assert.equal(ended.updated_at, at);
  assert.deepEqual(
    ended.players.map((p: any) => p.complete),
    [true, false],
  );
  assert.equal(
    (
      await db
        .prepare("SELECT status FROM rounds WHERE round_id=?")
        .bind(fresh.round_id)
        .first<any>()
    ).status,
    "active",
  );
  await worker.scheduled({ cron: "*/10 * * * *", scheduledTime: Date.now() });
  assert.equal((await ending(f)).ended_at, ended.ended_at);
});
test("expired rounds are finalized on access before Cron; late scores/joins cannot extend them and home allows a new round", async () => {
  const f = await fixture(1),
    sheet = await snapshot(f);
  const action = await req("/api/round-actions", f.c.token, {
    action_id: randomUUID(),
    kind: "join",
    code: f.r.join_code,
  });
  await settle(f.c.token, action.data.action_id);
  const at = Date.now() - SIX_HOURS;
  await db
    .prepare("UPDATE rounds SET updated_at=? WHERE round_id=?")
    .bind(at, f.r.round_id)
    .run();
  assert.equal((await save(f, write(sheet, [7]))).data.error, "round_ended");
  assert.equal(
    (await execute(f.c.token, action.data.action_id)).data.error,
    "round_ended",
  );
  assert.equal((await req("/api/home", f.a.token)).data.active_round, null);
  assert.equal((await ending(f)).ended_at, at + SIX_HOURS);
  assert.equal(
    (await db.prepare("SELECT COUNT(*) n FROM scores").first<any>()).n,
    0,
  );
  assert.equal(
    (await create(f.a.token, await course(f.a.token))).status,
    "active",
  );
});
test("nine holes can be complete independently of ending and null deletion makes a player incomplete", async () => {
  const f = await fixture(2);
  await db
    .prepare("UPDATE rounds SET hole_count=9 WHERE round_id=?")
    .bind(f.r.round_id)
    .run();
  for (let h = 1; h <= 9; h++)
    await save(f, write(await snapshot(f), [4, 4], h));
  await save(f, write(await snapshot(f), [4, null], 9));
  const result = await end(f);
  assert.deepEqual(
    result.data.players.map((p: any) => [p.holes_recorded, p.complete]),
    [
      [9, true],
      [8, false],
    ],
  );
});
test("score versus ending races cannot write into an ended round", async () => {
  const f = await fixture(1),
    state = await ending(f),
    sheet = await snapshot(f);
  const [close, score] = await Promise.all([
    end(f, f.a, {
      user_id: f.a.user_id,
      mutation_id: randomUUID(),
      record_version: state.record_version,
    }),
    save(f, write(sheet, [6])),
  ]);
  assert.ok(
    (close.status === 200 && score.data.error === "round_ended") ||
      (score.status === 200 && close.data.error === "end_changed"),
    JSON.stringify([close, score]),
  );
  if (close.status !== 200) await end(f);
  assert.equal(
    (await db.prepare("SELECT COUNT(*) n FROM active_round_users").first<any>())
      .n,
    0,
  );
});
test("join versus ending is atomic, and a new round can start immediately after a competing end", async () => {
  const f = await fixture(1),
    state = await ending(f);
  const j = await req("/api/round-actions", f.c.token, {
    action_id: randomUUID(),
    kind: "join",
    code: f.r.join_code,
  });
  await settle(f.c.token, j.data.action_id);
  const [close, join] = await Promise.all([
    end(f, f.a, {
      user_id: f.a.user_id,
      mutation_id: randomUUID(),
      record_version: state.record_version,
    }),
    execute(f.c.token, j.data.action_id),
  ]);
  assert.ok(
    (close.status === 200 && join.data.error === "round_ended") ||
      (join.status === 201 && close.data.error === "end_changed"),
    JSON.stringify([close, join]),
  );
  if (close.status !== 200) await end(f);
  assert.equal(
    (await db.prepare("SELECT COUNT(*) n FROM active_round_users").first<any>())
      .n,
    0,
  );
  const newRound = await create(f.c.token, await course(f.c.token));
  // Repeating the old end may not clear the new round's membership.
  await end(f);
  assert.equal(
    (await req("/api/home", f.c.token)).data.active_round.round_id,
    newRound.round_id,
  );
});
test("expired rename finalizes first; ended temporary name edits do not move the inactivity anchor", async () => {
  const f = await fixture(1),
    at = Date.now() - SIX_HOURS - 100;
  await db
    .prepare("UPDATE rounds SET updated_at=? WHERE round_id=?")
    .bind(at, f.r.round_id)
    .run();
  const renamed = await req(
    f.path + "/players/" + f.slots[0].slot_id,
    f.a.token,
    {
      mutation_id: randomUUID(),
      action: "rename",
      version: f.slots[0].version,
      name: "보존된 이름",
    },
    "PATCH",
  );
  assert.equal(renamed.status, 200);
  const state = await ending(f);
  assert.equal(state.status, "ended");
  assert.equal(state.ended_at, at + SIX_HOURS);
  assert.equal(state.updated_at, at);
});
