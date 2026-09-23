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
    outfile: ".tmp/player-worker.mjs",
    bundle: true,
    format: "esm",
    platform: "neutral",
  });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      scriptPath: ".tmp/player-worker.mjs",
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
async function edit(f: any, s: any, change: any, token = f.a.token) {
  return req(
    f.path + "/players/" + s.slot_id,
    token,
    { mutation_id: randomUUID(), version: s.version, ...change },
    "PATCH",
  );
}
async function setTargets(f: any, who: any, ids: string[], data?: any) {
  const previous =
    data ?? (await req(f.path + "/input-targets", who.token)).data;
  return req(
    f.path + "/input-targets",
    who.token,
    {
      mutation_id: randomUUID(),
      version: previous.version,
      roster_version: previous.roster_version,
      slot_ids: ids,
    },
    "PATCH",
  );
}
async function remove(f: any, s: any, extra = {}, who = f.a) {
  const info = (
    await req(f.path + "/players/" + s.slot_id + "/delete-impact", who.token)
  ).data;
  return req(
    f.path + "/players/" + s.slot_id,
    who.token,
    {
      mutation_id: randomUUID(),
      version: s.version,
      roster_version: info.roster_version,
      target_count: info.target_count,
      ...extra,
    },
    "DELETE",
  );
}
test("code and QR resolve identical nicknames by user ID; linking is separate from participation and ads", async () => {
  const f = await fixture();
  const looked = await req(f.path + "/player-lookup", f.a.token, {
    code: "yamone-golf://player/" + f.c.personal_code,
  });
  assert.equal(looked.data.user.user_id, f.c.user_id);
  const connected = await edit(f, f.slots[0], {
    action: "link",
    code: f.c.personal_code,
    confirmed_user_id: f.c.user_id,
  });
  assert.equal(connected.status, 200, JSON.stringify(connected));
  const s = connected.data.players[0];
  assert.equal(s.user_id, f.c.user_id);
  assert.equal((await req("/api/home", f.c.token)).data.active_round, null);
  assert.equal((await req(f.path, f.c.token)).status, 403);
  assert.equal(
    (await db
      .prepare("SELECT count(*) n FROM round_ad_settlements WHERE user_id=?")
      .bind(f.c.user_id)
      .first<any>())!.n,
    0,
  );
  assert.equal(
    (await edit(f, s, { action: "rename", name: "불가" })).data.error,
    "linked_name_locked",
  );
  await req("/api/me", f.c.token, { nickname: "변경한 이름" }, "PATCH");
  assert.equal(
    (await req(f.path + "/players", f.a.token)).data.players[0].name,
    "변경한 이름",
  );
  assert.equal(
    (
      await edit(f, f.slots[1], {
        action: "link",
        code: f.c.personal_code,
        confirmed_user_id: f.c.user_id,
      })
    ).data.error,
    "user_already_player",
  );
  assert.equal(
    (
      await edit(f, f.slots[2], {
        action: "link",
        code: f.b.personal_code,
        confirmed_user_id: f.c.user_id,
      })
    ).data.error,
    "player_link_changed",
  );
});
test("unlink preserves slot, scores and selection while allowing later temporary-name edits", async () => {
  const f = await fixture();
  const linked = await edit(f, f.slots[0], {
    action: "link",
    code: f.c.personal_code,
    confirmed_user_id: f.c.user_id,
  });
  const s = linked.data.players[0];
  await db
    .prepare(
      "INSERT INTO scores(round_id,slot_id,hole,strokes,updated_by,updated_at) VALUES(?,?,1,4,?,?)",
    )
    .bind(f.r.round_id, s.slot_id, f.a.user_id, Date.now())
    .run();
  await setTargets(f, f.b, [s.slot_id]);
  const unlinked = await edit(
    f,
    s,
    { action: "unlink", name: "임시 선수" },
    f.b.token,
  );
  assert.equal(unlinked.status, 200);
  assert.equal(unlinked.data.players[0].user_id, null);
  assert.equal(unlinked.data.players[0].slot_id, s.slot_id);
  assert.equal(unlinked.data.players[0].score_count, 1);
  const renamed = await edit(f, unlinked.data.players[0], {
    action: "rename",
    name: "새 임시 이름",
  });
  assert.equal(renamed.data.players[0].name, "새 임시 이름");
  assert.deepEqual(
    (await req(f.path + "/input-targets", f.b.token)).data.slot_ids,
    [s.slot_id],
  );
  assert.equal(
    (await db
      .prepare("SELECT strokes FROM scores WHERE slot_id=?")
      .bind(s.slot_id)
      .first<any>())!.strokes,
    4,
  );
  assert.equal(
    (await db
      .prepare(
        "SELECT count(*) n FROM player_audit WHERE slot_id=? AND kind='unlink'",
      )
      .bind(s.slot_id)
      .first<any>())!.n,
    1,
  );
});
test("simultaneous rename or link rejects stale changes and duplicate user links", async () => {
  const f = await fixture();
  const renamed = await Promise.all(
    ["A", "B"].map((name) => edit(f, f.slots[0], { action: "rename", name })),
  );
  assert.deepEqual(renamed.map((r) => r.status).sort(), [200, 409]);
  const linked = await Promise.all(
    f.slots.slice(1).map((s: any) =>
      edit(f, s, {
        action: "link",
        code: f.c.personal_code,
        confirmed_user_id: f.c.user_id,
      }),
    ),
  );
  assert.deepEqual(linked.map((r) => r.status).sort(), [200, 409]);
  const rows = (await req(f.path + "/players", f.a.token)).data.players;
  assert.equal(rows.filter((s: any) => s.user_id === f.c.user_id).length, 1);
});
test("at most eight live players; creation retries do not duplicate slots", async () => {
  const f = await fixture(7);
  const body = { mutation_id: randomUUID(), name: "추가 선수" };
  const replies = await Promise.all(
    Array.from({ length: 4 }, () => req(f.path + "/players", f.a.token, body)),
  );
  assert.ok(
    replies.every((r) => r.status === 200 || r.status === 201),
    JSON.stringify(replies),
  );
  assert.equal(replies[0].data.players.length, 8);
  assert.equal(
    (
      await req(f.path + "/players", f.a.token, {
        mutation_id: randomUUID(),
        name: "초과",
      })
    ).data.error,
    "player_limit",
  );
  assert.equal(
    (await req(f.path + "/players", f.a.token, { ...body, name: "다른 내용" }))
      .data.error,
    "request_reused",
  );
});
test("personal targets keep independent ordering and an explicit empty list, without changing round activity", async () => {
  const f = await fixture();
  const ids = f.slots.map((s: any) => s.slot_id);
  const before = (await db
    .prepare("SELECT updated_at FROM rounds WHERE round_id=?")
    .bind(f.r.round_id)
    .first<any>())!.updated_at;
  assert.equal(
    (await req(f.path + "/input-targets", f.a.token)).data.customized,
    false,
  );
  assert.equal((await setTargets(f, f.a, [ids[2], ids[0]])).status, 200);
  assert.deepEqual(
    (await req(f.path + "/input-targets", f.b.token)).data.slot_ids,
    ids,
  );
  assert.equal((await setTargets(f, f.b, [])).status, 200);
  assert.deepEqual(
    (await req(f.path + "/input-targets", f.b.token)).data.slot_ids,
    [],
  );
  assert.deepEqual(
    (await req(f.path + "/input-targets", f.a.token)).data.slot_ids,
    [ids[2], ids[0]],
  );
  assert.equal(
    (await db
      .prepare("SELECT updated_at FROM rounds WHERE round_id=?")
      .bind(f.r.round_id)
      .first<any>())!.updated_at,
    before,
  );
  const other = await create(f.c.token, await course(f.c.token));
  const otherSlot = (
    await req("/api/rounds/" + other.round_id + "/players", f.c.token)
  ).data.players[0];
  assert.equal((await setTargets(f, f.a, [otherSlot.slot_id])).status, 409);
  const state = (await req(f.path + "/input-targets", f.a.token)).data;
  await setTargets(f, f.a, [ids[1]]);
  assert.equal(
    (await setTargets(f, f.a, [ids[0]], state)).data.error,
    "targets_changed",
  );
});
test("deletion is blocked by linked users, scores, cancelled deliveries and deleted receipts", async () => {
  const f = await fixture(4);
  const s = f.slots;
  const linked = await edit(f, s[0], {
    action: "link",
    code: f.c.personal_code,
    confirmed_user_id: f.c.user_id,
  });
  assert.equal(
    (await remove(f, linked.data.players[0])).data.error,
    "player_protected",
  );
  await db
    .prepare(
      "INSERT INTO scores(round_id,slot_id,hole,strokes,updated_by,updated_at) VALUES(?,?,1,4,?,?)",
    )
    .bind(f.r.round_id, s[1].slot_id, f.a.user_id, Date.now())
    .run();
  assert.equal((await remove(f, s[1])).data.error, "player_protected");
  const delivery = randomUUID();
  await db
    .prepare(
      "INSERT INTO deliveries(delivery_id,round_id,slot_id,sender_id,recipient_id,status,created_at) VALUES(?,?,?,?,?,'cancelled',?)",
    )
    .bind(
      delivery,
      f.r.round_id,
      s[2].slot_id,
      f.a.user_id,
      f.c.user_id,
      Date.now(),
    )
    .run();
  assert.equal((await remove(f, s[2])).data.error, "player_protected");
  await db
    .prepare(
      "INSERT INTO receipts(receipt_id,round_id,user_id,player_slot_id,delivery_id,status,received_at,deleted_at) VALUES(?,?,?,?,?,'deleted',?,?)",
    )
    .bind(
      randomUUID(),
      f.r.round_id,
      f.c.user_id,
      s[2].slot_id,
      delivery,
      Date.now(),
      Date.now(),
    )
    .run();
  const impact = (
    await req(f.path + "/players/" + s[2].slot_id + "/delete-impact", f.a.token)
  ).data;
  assert.equal(impact.receipt_count, 1);
  assert.equal(impact.can_delete, false);
  assert.equal(
    (await req(f.path + "/players", f.a.token)).data.players.length,
    4,
  );
});
test("safe deletion preserves audit identity, cleans selected targets, increments their version, and retries once", async () => {
  const f = await fixture();
  const s = f.slots[1];
  await setTargets(f, f.a, [s.slot_id]);
  await setTargets(f, f.b, [f.slots[0].slot_id, s.slot_id]);
  const prior = (await req(f.path + "/input-targets", f.b.token)).data;
  const info = (
    await req(f.path + "/players/" + s.slot_id + "/delete-impact", f.a.token)
  ).data;
  assert.equal(info.target_count, 2);
  const body = {
    mutation_id: randomUUID(),
    version: s.version,
    roster_version: info.roster_version,
    target_count: info.target_count,
  };
  const r = await req(
    f.path + "/players/" + s.slot_id,
    f.a.token,
    body,
    "DELETE",
  );
  assert.equal(r.status, 200);
  assert.equal(r.data.players.length, 2);
  assert.equal(
    (await req(f.path + "/players/" + s.slot_id, f.a.token, body, "DELETE"))
      .status,
    200,
  );
  assert.deepEqual(
    (await req(f.path + "/input-targets", f.a.token)).data.slot_ids,
    [],
  );
  assert.equal(
    (await req(f.path + "/input-targets", f.b.token)).data.version,
    prior.version + 1,
  );
  assert.ok(
    (await db
      .prepare("SELECT deleted_at FROM player_slots WHERE slot_id=?")
      .bind(s.slot_id)
      .first<any>())!.deleted_at,
  );
  assert.equal((await setTargets(f, f.b, [s.slot_id], prior)).status, 409);
  assert.equal(
    (
      await req(f.path + "/players", f.a.token, {
        mutation_id: randomUUID(),
        name: "교체 선수",
      })
    ).data.players.length,
    3,
  );
});
test("delete confirmation is rechecked against newer target selection and new scores", async () => {
  const f = await fixture();
  const s = f.slots[0];
  const info = (
    await req(f.path + "/players/" + s.slot_id + "/delete-impact", f.a.token)
  ).data;
  await setTargets(f, f.b, [s.slot_id]);
  assert.equal(
    (await remove(f, s, { target_count: info.target_count })).data.error,
    "delete_changed",
  );
  await db
    .prepare(
      "INSERT INTO scores(round_id,slot_id,hole,strokes,updated_by,updated_at) VALUES(?,?,1,5,?,?)",
    )
    .bind(f.r.round_id, s.slot_id, f.a.user_id, Date.now())
    .run();
  assert.equal((await remove(f, s)).data.error, "player_protected");
});
test("one remaining player cannot be deleted; ended rounds retain names and lock adding/deleting slots", async () => {
  const f = await fixture(1);
  assert.equal((await remove(f, f.slots[0])).data.error, "last_player");
  assert.equal(
    (await edit(f, f.slots[0], { action: "rename", name: "불가" }, f.c.token))
      .status,
    403,
  );
  assert.equal((await req(f.path + "/input-targets", f.c.token)).status, 403);
  await db
    .prepare("UPDATE rounds SET status='ended',ended_at=? WHERE round_id=?")
    .bind(Date.now(), f.r.round_id)
    .run();
  assert.equal(
    (await edit(f, f.slots[0], { action: "rename", name: "종료 후 임시 이름" }))
      .status,
    200,
  );
  assert.equal(
    (
      await req(f.path + "/players", f.a.token, {
        mutation_id: randomUUID(),
        name: "불가",
      })
    ).data.error,
    "round_ended",
  );
  assert.equal((await setTargets(f, f.a, [])).data.error, "round_ended");
  assert.equal((await req(f.path + "/players", f.a.token)).status, 200);
});
test("recovery retains personal targets and linked user ID but blocks writes from the old device", async () => {
  const f = await fixture();
  await setTargets(f, f.a, [f.slots[2].slot_id]);
  await edit(f, f.slots[0], {
    action: "link",
    code: f.a.personal_code,
    confirmed_user_id: f.a.user_id,
  });
  const token = randomBytes(32).toString("hex"),
    next =
      "YMGF" +
      Array.from(
        randomBytes(32),
        (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32],
      ).join("");
  const recovered = await req("/api/recovery/claim", token, {
    device_secret: token,
    recovery_key: f.a.key,
    next_recovery_key: next,
  });
  assert.equal(recovered.status, 200);
  assert.deepEqual(
    (await req(f.path + "/input-targets", token)).data.slot_ids,
    [f.slots[2].slot_id],
  );
  assert.equal(
    (await req(f.path + "/players", token)).data.players[0].user_id,
    f.a.user_id,
  );
  assert.equal(
    (await edit(f, f.slots[1], { action: "rename", name: "거절" })).data.error,
    "device_moved",
  );
});
