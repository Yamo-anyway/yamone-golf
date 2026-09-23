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
    outfile: ".tmp/round-worker.mjs",
    bundle: true,
    format: "esm",
    platform: "neutral",
  });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      scriptPath: ".tmp/round-worker.mjs",
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
      "round_ad_settlements",
      "round_actions",
      "round_invitations",
      "round_lifecycle_mutations",
      "round_completions",
      "round_endings",
      "record_mutations",
      "receipt_actions",
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
test("public course editing uses revisions; private order and removal never change shared courses", async () => {
  const a = await user(),
    b = await user(),
    c = await course(a.token),
    c2 = await course(a.token);
  let mine = await req(
    "/api/me/courses",
    a.token,
    { action: "add", course_id: c.course_id, version: 0 },
    "PATCH",
  );
  assert.equal(mine.status, 200);
  mine = await req(
    "/api/me/courses",
    a.token,
    { action: "add", course_id: c2.course_id, version: 1 },
    "PATCH",
  );
  const reordered = await req(
    "/api/me/courses",
    a.token,
    { action: "reorder", course_ids: [c2.course_id, c.course_id], version: 2 },
    "PATCH",
  );
  assert.deepEqual(
    reordered.data.courses.map((x: any) => x.course_id),
    [c2.course_id, c.course_id],
  );
  assert.equal((await req("/api/me/courses", b.token)).data.courses.length, 0);
  assert.equal(
    (
      await req(
        "/api/me/courses",
        a.token,
        { action: "remove", course_id: c.course_id, version: 2 },
        "PATCH",
      )
    ).data.error,
    "list_changed",
  );
  assert.equal(
    (
      await req(
        "/api/me/courses",
        a.token,
        { action: "remove", course_id: c.course_id, version: 3 },
        "PATCH",
      )
    ).status,
    200,
  );
  assert.equal((await req("/api/courses/" + c.course_id, a.token)).status, 200);
  const edits = await Promise.all(
    ["새 이름 A", "새 이름 B"].map((name) =>
      req("/api/courses/" + c.course_id, b.token, { ...c, name }, "PATCH"),
    ),
  );
  assert.deepEqual(edits.map((x) => x.status).sort(), [200, 409]);
  assert.equal(
    edits.find((x) => x.status === 409)!.data.error,
    "course_changed",
  );
});
test("validates PAR and all 9 holes, empty names, 1–8 players and course revisions", async () => {
  const a = await user();
  const bad = input();
  bad.segments[0].pars[0] = 0;
  assert.equal((await req("/api/courses", a.token, bad)).status, 400);
  const c = await course(a.token);
  const payload = {
    action_id: randomUUID(),
    kind: "create",
    course_id: c.course_id,
    course_version: 0,
    segment_indices: [0],
    players: [],
  };
  assert.equal(
    (await req("/api/round-actions", a.token, payload)).data.error,
    "course_changed",
  );
  assert.equal(
    (
      await req("/api/round-actions", a.token, {
        ...payload,
        course_version: 1,
      })
    ).data.error,
    "invalid_players",
  );
});
test("round snapshot survives later course edits; creator can be a recorder, not a player", async () => {
  const a = await user(),
    c = await course(a.token),
    r = await create(a.token, c);
  await req(
    "/api/courses/" + c.course_id,
    a.token,
    {
      ...c,
      name: "수정한 골프장",
      segments: [{ name: "NEW", pars: Array(9).fill(7) }],
    },
    "PATCH",
  );
  const detail = await req("/api/rounds/" + r.round_id, a.token);
  assert.equal(detail.data.round.course.name, c.name);
  assert.equal(detail.data.round.hole_count, 18);
  assert.equal(detail.data.round.course.segments.length, 2);
  assert.equal(detail.data.players[0].user_id, null);
  assert.equal(detail.data.participants[0].user_id, a.user_id);
  assert.equal(
    (await req("/api/home", a.token)).data.active_round.round_id,
    r.round_id,
  );
});
test("simultaneous create and join settle into exactly one active round; failed action does not leak partial rows", async () => {
  const a = await user(),
    b = await user(),
    c = await course(a.token),
    other = await create(b.token, c),
    own = await prepare(a.token, c);
  const join = await req("/api/round-actions", a.token, {
    action_id: randomUUID(),
    kind: "join",
    code: other.join_code,
  });
  assert.equal(join.status, 201);
  await settle(a.token, own.action_id);
  await settle(a.token, join.data.action_id);
  const results = await Promise.all([
    execute(a.token, own.action_id),
    execute(a.token, join.data.action_id),
  ]);
  assert.equal(
    results.filter((x) => x.status === 201).length,
    1,
    JSON.stringify(results),
  );
  assert.equal(
    results.find((x) => x.status === 409)!.data.error,
    "active_round_exists",
  );
  assert.equal(
    (await db
      .prepare("SELECT count(*) n FROM active_round_users WHERE user_id=?")
      .bind(a.user_id)
      .first<any>())!.n,
    1,
  );
  const active = (await req("/api/home", a.token)).data.active_round;
  assert.equal(
    (await db
      .prepare("SELECT count(*) n FROM round_participants WHERE user_id=?")
      .bind(a.user_id)
      .first<any>())!.n,
    1,
  );
  assert.ok(active);
  assert.equal(
    (await db.prepare("SELECT count(*) n FROM mutation_guards").first<any>())!
      .n,
    0,
  );
});
test("interrupted ad cannot execute; settled action retries after lost response without a second settlement", async () => {
  const a = await user(),
    c = await course(a.token),
    p = await prepare(a.token, c);
  assert.equal((await execute(a.token, p.action_id)).data.error, "ad_required");
  assert.equal(
    (
      await req("/api/round-actions/" + p.action_id + "/ad", a.token, {
        outcome: "interrupted",
      })
    ).data.error,
    "ad_interrupted",
  );
  assert.equal((await req("/api/home", a.token)).data.active_round, null);
  await settle(a.token, p.action_id, "load_failed");
  const retries = await Promise.all(
    Array.from({ length: 5 }, () => execute(a.token, p.action_id)),
  );
  assert.ok(
    retries.every((r) => r.status === 200 || r.status === 201),
    JSON.stringify(retries),
  );
  assert.equal(new Set(retries.map((r) => r.data.round.round_id)).size, 1);
  assert.equal(
    (await db
      .prepare("SELECT count(*) n FROM round_ad_settlements")
      .first<any>())!.n,
    1,
  );
  assert.equal(
    (await req("/api/round-actions/" + p.action_id, a.token)).data.ad_settled,
    true,
  );
});
test("server rechecks round state after ad; a completed ad remains settled after failed execution", async () => {
  const a = await user(),
    b = await user(),
    c = await course(a.token),
    r = await create(a.token, c);
  const p = await req("/api/round-actions", b.token, {
    action_id: randomUUID(),
    kind: "join",
    code: r.join_code,
  });
  await settle(b.token, p.data.action_id);
  await db
    .prepare("UPDATE rounds SET status='ended',ended_at=? WHERE round_id=?")
    .bind(Date.now(), r.round_id)
    .run();
  assert.equal(
    (await execute(b.token, p.data.action_id)).data.error,
    "round_ended",
  );
  assert.equal(
    (await req("/api/round-actions/" + p.data.action_id, b.token)).data
      .ad_settled,
    true,
  );
  assert.equal((await req("/api/home", b.token)).data.active_round, null);
});
test("home invitation decline releases no membership; accepting links only a participant and is idempotent", async () => {
  const a = await user(),
    b = await user(),
    c = await course(a.token),
    r = await create(a.token, c);
  const invite = async () => {
    const id = randomUUID();
    assert.equal(
      (
        await req("/api/rounds/" + r.round_id + "/invitations", a.token, {
          invitation_id: id,
          personal_code: b.personal_code,
        })
      ).status,
      201,
    );
    return id;
  };
  const first = await invite();
  assert.equal((await req("/api/home", b.token)).data.invitations.length, 1);
  assert.equal(
    (await req("/api/invitations/" + first + "/decline", b.token, {})).status,
    200,
  );
  assert.equal((await req("/api/home", b.token)).data.invitations.length, 0);
  const second = await invite(),
    p = await req("/api/round-actions", b.token, {
      action_id: randomUUID(),
      kind: "join",
      invitation_id: second,
    });
  await settle(b.token, p.data.action_id);
  assert.equal((await execute(b.token, p.data.action_id)).status, 201);
  assert.equal((await req("/api/home", b.token)).data.invitations.length, 0);
  const detail = await req("/api/rounds/" + r.round_id, b.token);
  assert.equal(detail.data.participants.length, 2);
  assert.equal(detail.data.players.length, 1);
  assert.equal((await execute(b.token, p.data.action_id)).status, 200);
});
test("nonparticipants cannot inspect a round or invite, another user cannot settle an action, revoked device cannot write", async () => {
  const a = await user(),
    b = await user(),
    c = await course(a.token),
    r = await create(a.token, c);
  assert.equal((await req("/api/rounds/" + r.round_id, b.token)).status, 403);
  assert.equal(
    (
      await req("/api/round-actions/" + r.round_id + "/ad", b.token, {
        outcome: "completed",
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await req("/api/rounds/" + r.round_id + "/invitations", b.token, {
        invitation_id: randomUUID(),
        personal_code: a.personal_code,
      })
    ).status,
    403,
  );
  await db
    .prepare("UPDATE devices SET revoked_at=? WHERE user_id=?")
    .bind(Date.now(), a.user_id)
    .run();
  assert.equal(
    (
      await req(
        "/api/courses/" + c.course_id,
        a.token,
        { ...c, name: "거절" },
        "PATCH",
      )
    ).data.error,
    "device_moved",
  );
  assert.equal(
    (await req("/api/courses/" + c.course_id, b.token)).data.course.name,
    c.name,
  );
});
