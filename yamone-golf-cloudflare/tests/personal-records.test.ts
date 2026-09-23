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
    outfile: ".tmp/personal-worker.mjs",
    bundle: true,
    format: "esm",
    platform: "neutral",
  });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      scriptPath: ".tmp/personal-worker.mjs",
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
async function link(f: any, index: number, who: any) {
  const p = (await req(f.path + "/players", f.a.token)).data.players[index];
  const result = await req(
    f.path + "/players/" + p.slot_id,
    f.a.token,
    {
      mutation_id: randomUUID(),
      version: p.version,
      action: "link",
      code: who.personal_code,
      confirmed_user_id: who.user_id,
    },
    "PATCH",
  );
  assert.equal(result.status, 200, JSON.stringify(result));
  return result.data.players[index];
}
async function ready() {
  const f = await fixture(2);
  await save(f, write(await snapshot(f), [4, 7]));
  await end(f);
  const own = await link(f, 0, f.a),
    visitor = await link(f, 1, f.c);
  return { ...f, own, visitor };
}
async function sendRecord(f: any, p: any, extra = {}, who = f.a) {
  return req(f.path + "/deliveries", who.token, {
    user_id: who.user_id,
    mutation_id: randomUUID(),
    slot_id: p.slot_id,
    version: p.version,
    recipient_id: p.user_id,
    ...extra,
  });
}
async function receiveAction(v: any, who: any) {
  const response = await req("/api/receipt-actions", who.token, {
    user_id: who.user_id,
    action_id: randomUUID(),
    delivery_id: v.delivery_id,
  });
  assert.ok([200, 201].includes(response.status), JSON.stringify(response));
  return response.data;
}
const receiveAd = (a: any, who: any, outcome = "unavailable") =>
  req("/api/receipt-actions/" + a.action_id + "/ad", who.token, {
    user_id: who.user_id,
    outcome,
  });
const receiveExec = (a: any, who: any) =>
  req("/api/receipt-actions/" + a.action_id + "/execute", who.token, {
    user_id: who.user_id,
  });
const cancelDelivery = (v: any, who: any) =>
  req("/api/deliveries/" + v.delivery_id + "/cancel", who.token, {
    user_id: who.user_id,
    mutation_id: randomUUID(),
  });
const deleteRecord = (r: any, who: any, mutation_id = randomUUID()) =>
  req(
    "/api/records/" + r.receipt_id,
    who.token,
    { user_id: who.user_id, mutation_id },
    "DELETE",
  );
async function received(f: any, p: any, who: any) {
  const sent = await sendRecord(f, p);
  assert.equal(sent.status, 201, JSON.stringify(sent));
  const a = await receiveAction(sent.data.delivery, who);
  if (!a.ad_settled) assert.equal((await receiveAd(a, who)).status, 200);
  const result = await receiveExec(a, who);
  assert.equal(result.status, 201, JSON.stringify(result));
  return { a, delivery: sent.data.delivery, receipt: result.data.receipt };
}
const DAY = 86400000;
const view = (r: any, u: any) =>
  req("/api/records/" + r.receipt_id + "/scores", u.token);
const change = (v: any, strokes: any, hole: any = 1, extra = {}) => ({
  user_id: v.user_id,
  mutation_id: randomUUID(),
  player_slot_id: v.player_slot_id,
  slot_version: v.slot_version,
  hole,
  strokes,
  version: v.scores.find((s: any) => s.hole === hole)?.version ?? 0,
  ...extra,
});
const put = (r: any, u: any, w: any) =>
  req("/api/records/" + r.receipt_id + "/scores", u.token, w, "PUT");
const stats = (u: any) => req("/api/statistics", u.token);
async function complete(f: any, p: any, n = 18, base = 4) {
  await db.batch(
    Array.from({ length: n }, (_, i) =>
      db
        .prepare(
          `INSERT INTO scores(round_id,slot_id,hole,strokes,version,updated_by,updated_at) VALUES(?,?,?,?,1,?,?) ON CONFLICT(slot_id,hole) DO UPDATE SET strokes=excluded.strokes`,
        )
        .bind(f.r.round_id, p.slot_id, i + 1, base, f.a.user_id, Date.now()),
    ),
  );
}
test("only linked receivers edit their own slot; participants cannot edit others after ending", async () => {
  const f = await ready(),
    got = await received(f, f.visitor, f.c),
    own = await received(f, f.own, f.a),
    r = got.receipt,
    v = (await view(r, f.c)).data;
  assert.equal(v.edit.allowed, true);
  assert.equal(v.scores.length, 1);
  assert.equal((await view(r, f.a)).status, 404);
  assert.equal((await put(r, f.a, change(v, 3))).data.error, "user_changed");
  assert.equal(
    (await put(r, f.c, change(v, 5, 1, { player_slot_id: f.own.slot_id })))
      .status,
    403,
  );
  assert.equal((await put(r, f.c, change(v, 5))).status, 200);
  const sheet = (await req("/api/records/" + own.receipt.receipt_id, f.a.token))
    .data.sheet;
  assert.equal(
    sheet.scores.find(
      (s: any) => s.slot_id === f.visitor.slot_id && s.hole === 1,
    ).strokes,
    5,
  );
  assert.equal(
    sheet.scores.find((s: any) => s.slot_id === f.own.slot_id && s.hole === 1)
      .strokes,
    4,
  );
  assert.equal((await req(f.path + "/scores", f.c.token)).status, 403);
  assert.equal(
    (await save(f, write(await snapshot(f), [3, 3]))).data.error,
    "round_ended",
  );
});
test("fixed end plus 24h deadline, late receipt, replay after expiry and deletion", async () => {
  const f = await ready(),
    got = await received(f, f.visitor, f.c),
    r = got.receipt,
    v = (await view(r, f.c)).data,
    w = change(v, 6),
    before = await ending(f);
  assert.equal(v.edit.deadline, before.ended_at + DAY);
  assert.equal((await put(r, f.c, w)).status, 200);
  assert.equal((await ending(f)).ended_at, before.ended_at);
  assert.equal((await ending(f)).updated_at, before.updated_at);
  await db
    .prepare("UPDATE rounds SET ended_at=? WHERE round_id=?")
    .bind(Date.now() - DAY, f.r.round_id)
    .run();
  assert.equal((await view(r, f.c)).data.edit.allowed, false);
  assert.equal((await put(r, f.c, change(v, 8))).data.error, "record_locked");
  assert.equal((await put(r, f.c, w)).data.replayed, true);
  await deleteRecord(r, f.c);
  assert.equal((await put(r, f.c, w)).data.replayed, true);
  assert.equal(
    (await put(r, f.c, { ...w, strokes: 9 })).data.error,
    "request_reused",
  );
  assert.equal(
    (await put(r, f.c, { ...w, mutation_id: randomUUID() })).data.error,
    "record_deleted",
  );
  const g = await ready();
  await db
    .prepare("UPDATE rounds SET ended_at=? WHERE round_id=?")
    .bind(Date.now() - DAY - 1, g.r.round_id)
    .run();
  const late = await received(g, g.visitor, g.c);
  assert.equal((await view(late.receipt, g.c)).data.edit.allowed, false);
});
test("unlink, relink version and revoked device prevent new correction", async () => {
  const f = await ready(),
    got = await received(f, f.visitor, f.c),
    r = got.receipt,
    v = (await view(r, f.c)).data,
    w = change(v, 5);
  await req(
    f.path + "/players/" + v.player_slot_id,
    f.a.token,
    {
      mutation_id: randomUUID(),
      version: v.slot_version,
      action: "unlink",
      name: "임시",
    },
    "PATCH",
  );
  assert.equal((await put(r, f.c, w)).data.error, "record_unlinked");
  await link(f, 1, f.c);
  assert.equal((await put(r, f.c, w)).data.error, "player_link_changed");
  const fresh = (await view(r, f.c)).data;
  assert.equal((await put(r, f.c, change(fresh, 5))).status, 200);
  await req("/api/device/reset", f.c.token, {});
  assert.equal((await put(r, f.c, change(fresh, 6))).status, 401);
});
test("same-value no-op, repeated conflict confirmation, replay and concurrent writes preserve scores", async () => {
  const f = await ready(),
    got = await received(f, f.visitor, f.c),
    r = got.receipt,
    v = (await view(r, f.c)).data;
  const count = async () =>
    Number(
      (await db
        .prepare("SELECT COUNT(*) n FROM score_audit WHERE slot_id=?")
        .bind(v.player_slot_id)
        .first<any>())!.n,
    );
  const n = await count();
  assert.equal(
    (await put(r, f.c, change(v, 7, 1, { version: 0 }))).status,
    200,
  );
  assert.equal(await count(), n);
  const w = change(v, 6);
  assert.equal((await put(r, f.c, w)).status, 200);
  let conflict = await put(r, f.c, change(v, 5));
  assert.equal(conflict.data.error, "score_conflict");
  assert.equal(conflict.data.current.strokes, 6);
  const confirmed = change(conflict.data.view, 5);
  assert.equal((await put(r, f.c, change(conflict.data.view, 8))).status, 200);
  conflict = await put(r, f.c, confirmed);
  assert.equal(conflict.data.current.strokes, 8);
  assert.equal((await put(r, f.c, change(conflict.data.view, 5))).status, 200);
  assert.equal((await put(r, f.c, w)).data.replayed, true);
  const latest = (await view(r, f.c)).data;
  assert.equal(latest.scores[0].strokes, 5);
  const results = await Promise.all([
    put(r, f.c, change(latest, 3)),
    put(r, f.c, change(latest, 4)),
  ]);
  assert.equal(results.filter((v) => v.status === 200).length, 1);
  assert.equal(
    results.filter((v) => v.data.error === "score_conflict").length,
    1,
  );
});
test("fill/null changes current completion and statistics, preserving end snapshot and other incomplete players", async () => {
  const f = await ready();
  await complete(f, f.visitor, 17);
  const got = await received(f, f.visitor, f.c),
    r = got.receipt;
  assert.equal((await stats(f.c)).data.eligible_rounds, 0);
  let v = (await view(r, f.c)).data;
  assert.equal((await put(r, f.c, change(v, 4, 18))).status, 200);
  let s = (await stats(f.c)).data;
  assert.equal(s.eligible_rounds, 1);
  assert.equal(s.average_strokes, 72);
  assert.equal(s.average_to_par, 0);
  assert.equal(s.distribution.par, 10);
  assert.equal(s.distribution.birdie, 4);
  assert.equal(s.distribution.bogey, 4);
  assert.equal(
    (await ending(f)).players.find((p: any) => p.slot_id === f.visitor.slot_id)
      .holes_recorded,
    18,
  );
  assert.equal(
    (await db
      .prepare("SELECT holes_recorded FROM round_completions WHERE slot_id=?")
      .bind(f.visitor.slot_id)
      .first<any>())!.holes_recorded,
    1,
  );
  v = (await view(r, f.c)).data;
  assert.equal((await put(r, f.c, change(v, null, 18))).status, 200);
  s = (await stats(f.c)).data;
  assert.equal(s.eligible_rounds, 0);
  assert.equal(s.average_strokes, null);
  assert.equal(s.excluded.incomplete, 1);
  assert.equal(
    (await view(r, f.c)).data.scores.find((s: any) => s.hole === 18).strokes,
    null,
  );
});
test("statistics exclude nine-hole, unreceived, deleted and unlinked records; own scores only", async () => {
  const f = await ready();
  await complete(f, f.visitor);
  await complete(f, f.own, 18, 9);
  assert.equal((await stats(f.c)).data.received_rounds, 0);
  const got = await received(f, f.visitor, f.c),
    r = got.receipt;
  let s = (await stats(f.c)).data;
  assert.equal(s.eligible_rounds, 1);
  assert.equal(s.best_strokes, 72);
  assert.equal(s.by_par.length, 3);
  assert.equal((await stats(f.a)).data.eligible_rounds, 0);
  await db
    .prepare("UPDATE rounds SET hole_count=9 WHERE round_id=?")
    .bind(f.r.round_id)
    .run();
  s = (await stats(f.c)).data;
  assert.equal(s.excluded.nine_hole, 1);
  assert.equal(s.eligible_rounds, 0);
  await db
    .prepare("UPDATE rounds SET hole_count=18 WHERE round_id=?")
    .bind(f.r.round_id)
    .run();
  const p = (await req(f.path + "/players", f.a.token)).data.players[1];
  await req(
    f.path + "/players/" + p.slot_id,
    f.a.token,
    {
      mutation_id: randomUUID(),
      version: p.version,
      action: "unlink",
      name: "분리",
    },
    "PATCH",
  );
  s = (await stats(f.c)).data;
  assert.equal(s.excluded.unlinked, 1);
  assert.equal(s.eligible_rounds, 0);
  await deleteRecord(r, f.c);
  s = (await stats(f.c)).data;
  assert.equal(s.received_rounds, 0);
  assert.equal(s.recent.length, 0);
});
test("search escapes SQL wildcard input, filters and ownership; invalid strokes and user binding rejected", async () => {
  const f = await ready(),
    got = await received(f, f.visitor, f.c),
    r = got.receipt;
  assert.equal(
    (await req("/api/records?q=" + encodeURIComponent("골프"), f.c.token)).data
      .items.length,
    1,
  );
  for (const q of ["%25", "_"])
    assert.equal(
      (await req("/api/records?q=" + q, f.c.token)).data.items.length,
      0,
    );
  assert.equal(
    (await req("/api/records?scope=incomplete", f.c.token)).data.items.length,
    1,
  );
  for (const scope of ["statistics", "nine"])
    assert.equal(
      (await req("/api/records?scope=" + scope, f.c.token)).data.items.length,
      0,
    );
  assert.equal((await req("/api/records", f.b.token)).data.items.length, 0);
  for (const suffix of ["scope=bad", "before=3:bad"])
    assert.equal((await req("/api/records?" + suffix, f.c.token)).status, 400);
  const v = (await view(r, f.c)).data;
  for (const value of [0, -1, 1.2, 1000, "5", undefined])
    assert.equal((await put(r, f.c, change(v, value))).status, 400);
  for (const hole of [0, 19, 1.2, "1"])
    assert.equal((await put(r, f.c, change(v, 5, hole))).status, 400);
  assert.equal(
    (
      await req(
        "/api/records/" + r.receipt_id + "/scores?user_id=" + f.a.user_id,
        f.c.token,
      )
    ).data.error,
    "user_changed",
  );
});
test("transaction rechecks exact server deadline, deletion and unlink after initial read; rejected writes roll back", async () => {
  const f = await ready(),
    got = await received(f, f.visitor, f.c),
    r = got.receipt,
    v = (await view(r, f.c)).data;
  const worker = (await import("../src/index")).default;
  for (const reason of ["deadline", "delete", "unlink"]) {
    await db
      .prepare(
        "UPDATE receipts SET status='received',deleted_at=NULL WHERE receipt_id=?",
      )
      .bind(r.receipt_id)
      .run();
    await db
      .prepare("UPDATE player_slots SET user_id=? WHERE slot_id=?")
      .bind(f.c.user_id, v.player_slot_id)
      .run();
    await db
      .prepare("UPDATE rounds SET ended_at=? WHERE round_id=?")
      .bind(Date.now(), f.r.round_id)
      .run();
    let intercepted = false,
      guardPrepared = false;
    const proxy = new Proxy(db, {
      get(target, key) {
        if (key === "prepare")
          return (sql: string) => {
            if (sql.includes("INSERT INTO mutation_guards"))
              guardPrepared = true;
            return target.prepare(sql);
          };
        if (key === "batch")
          return async (ss: any[]) => {
            if (!intercepted && guardPrepared) {
              intercepted = true;
              if (reason === "deadline")
                await db
                  .prepare("UPDATE rounds SET ended_at=? WHERE round_id=?")
                  .bind(Date.now() - DAY, f.r.round_id)
                  .run();
              if (reason === "delete")
                await db
                  .prepare(
                    "UPDATE receipts SET status='deleted' WHERE receipt_id=?",
                  )
                  .bind(r.receipt_id)
                  .run();
              if (reason === "unlink")
                await db
                  .prepare(
                    "UPDATE player_slots SET user_id=NULL WHERE slot_id=?",
                  )
                  .bind(v.player_slot_id)
                  .run();
            }
            return target.batch(ss);
          };
        const x = Reflect.get(target, key);
        return typeof x === "function" ? x.bind(target) : x;
      },
    });
    const w = change(v, 99),
      response = await worker.fetch(
        new Request(
          "https://api.test/api/records/" + r.receipt_id + "/scores",
          {
            method: "PUT",
            headers: {
              Authorization: "Bearer " + f.c.token,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(w),
          },
        ),
        {
          DB: proxy as any,
          ENVIRONMENT: "test",
          ALLOWED_ORIGINS: "https://app.test",
        },
      );
    assert.equal(intercepted, true);
    assert.equal(response.status, 409);
    assert.equal(
      (await db
        .prepare("SELECT strokes FROM scores WHERE slot_id=? AND hole=1")
        .bind(v.player_slot_id)
        .first<any>())!.strokes,
      7,
    );
    assert.equal(
      await db
        .prepare("SELECT 1 FROM score_mutations WHERE mutation_id=?")
        .bind(w.mutation_id)
        .first(),
      null,
    );
  }
});

test("multiple eligible rounds aggregate actual scores and snapshot pars, without requiring other players to finish", async () => {
  const f = await ready();
  await complete(f, f.visitor);
  await received(f, f.visitor, f.c);
  const next = await create(f.a.token, await course(f.a.token));
  const g = { ...f, r: next, path: "/api/rounds/" + next.round_id };
  await end(g);
  const p = await link(g, 0, f.c);
  await complete(g, p, 18, 5);
  await received(g, p, f.c);
  const s = (await stats(f.c)).data;
  assert.equal(s.eligible_rounds, 2);
  assert.equal(s.average_strokes, 81);
  assert.equal(s.best_strokes, 72);
  assert.equal(s.highest_strokes, 90);
  assert.equal(s.average_to_par, 9);
  assert.equal(s.recent.length, 2);
  assert.equal(
    s.by_par.reduce((n: number, p: any) => n + p.holes, 0),
    36,
  );
  assert.equal(
    Object.values(s.distribution).reduce((a: any, b: any) => a + b, 0),
    36,
  );
  // Changes to the public course cannot rewrite the historical PAR snapshot.
  await db
    .prepare("UPDATE courses SET segments_json=?")
    .bind(JSON.stringify([{ name: "NEW", pars: Array(9).fill(7) }]))
    .run();
  assert.equal((await stats(f.c)).data.average_to_par, 9);
});
