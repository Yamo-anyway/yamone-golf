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
    outfile: ".tmp/records-worker.mjs",
    bundle: true,
    format: "esm",
    platform: "neutral",
  });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      scriptPath: ".tmp/records-worker.mjs",
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
      "peoria_runs",
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
test("ended players can be linked by code/QR without joining; running rounds cannot send records", async () => {
  const f = await fixture(2);
  const p = await link(f, 0, f.c);
  assert.equal((await sendRecord(f, p)).data.error, "round_not_ended");
  await end(f);
  const lookup = await req(f.path + "/player-lookup", f.a.token, {
    code: "yamone-golf://player/" + f.a.personal_code,
  });
  assert.equal(lookup.status, 200);
  await link(f, 1, f.a);
  assert.equal((await req(f.path, f.c.token)).status, 403);
  assert.equal((await req("/api/home", f.c.token)).data.active_round, null);
  assert.equal((await snapshot(f)).scores.length, 0);
});
test("sending is idempotent, aliases pending sends, checks confirmed slot ownership and preserves a delivery's terminal state", async () => {
  const f = await ready(),
    id = randomUUID();
  const first = await sendRecord(f, f.visitor, { mutation_id: id });
  assert.equal(first.status, 201);
  assert.equal(
    (await sendRecord(f, f.visitor, { mutation_id: id })).data.delivery
      .delivery_id,
    id,
  );
  assert.equal(
    (await sendRecord(f, f.visitor, { mutation_id: id, version: 99 })).data
      .error,
    "request_reused",
  );
  assert.equal(
    (await sendRecord(f, f.visitor, { recipient_id: f.b.user_id })).data.error,
    "player_link_changed",
  );
  const alias = randomUUID();
  assert.equal(
    (await sendRecord(f, f.visitor, { mutation_id: alias })).data.delivery
      .delivery_id,
    id,
  );
  await cancelDelivery(first.data.delivery, f.a);
  assert.equal(
    (await sendRecord(f, f.visitor, { mutation_id: alias })).data.delivery
      .status,
    "cancelled",
  );
  assert.equal(
    (await req("/api/record-inbox", f.c.token)).data.items.length,
    0,
  );
});
test("nonparticipant receive requires settled ad, interrupted ads create no receipt, full round read is private and read-only", async () => {
  const f = await ready(),
    v = (await sendRecord(f, f.visitor)).data.delivery,
    a = await receiveAction(v, f.c);
  assert.equal(a.ad_settled, false);
  assert.equal((await receiveExec(a, f.c)).data.error, "ad_required");
  assert.equal(
    (await receiveAd(a, f.c, "interrupted")).data.error,
    "ad_interrupted",
  );
  assert.equal((await req("/api/records", f.c.token)).data.items.length, 0);
  assert.equal((await receiveAd(a, f.c, "load_failed")).status, 200);
  const result = await receiveExec(a, f.c);
  assert.equal(result.status, 201);
  const r = result.data.receipt,
    detail = await req("/api/records/" + r.receipt_id, f.c.token);
  assert.equal(detail.data.sheet.players.length, 2);
  assert.deepEqual(
    detail.data.sheet.scores.map((s: any) => s.strokes).sort(),
    [4, 7],
  );
  assert.equal(detail.data.receipt.player_slot_id, f.visitor.slot_id);
  assert.equal(detail.data.current_player, true);
  assert.equal(detail.data.can_manage, false);
  assert.equal(
    (await req("/api/records/" + r.receipt_id, f.b.token)).status,
    404,
  );
  assert.equal((await req(f.path + "/scores", f.c.token)).status, 403);
  assert.equal((await req(f.path + "/players", f.c.token)).status, 403);
  assert.equal(
    (await req("/api/record-inbox", f.c.token)).data.items.length,
    0,
  );
});
test("creator receives without another ad; receiving never alters an unrelated active round or membership", async () => {
  const f = await ready(),
    other = await create(f.c.token, await course(f.c.token));
  const own = (await sendRecord(f, f.own)).data.delivery,
    a = await receiveAction(own, f.a);
  assert.equal(a.ad_settled, true);
  assert.equal((await receiveExec(a, f.a)).status, 201);
  const rec = await received(f, f.visitor, f.c);
  assert.equal(rec.receipt.user_id, f.c.user_id);
  assert.equal(
    (await req("/api/home", f.c.token)).data.active_round.round_id,
    other.round_id,
  );
  assert.equal(
    (
      await db
        .prepare(
          "SELECT COUNT(*) n FROM round_participants WHERE round_id=? AND user_id=?",
        )
        .bind(f.r.round_id, f.c.user_id)
        .first<any>()
    ).n,
    0,
  );
  assert.equal(
    (
      await db
        .prepare(
          "SELECT COUNT(*) n FROM round_ad_settlements WHERE round_id=? AND user_id=?",
        )
        .bind(f.r.round_id, f.a.user_id)
        .first<any>()
    ).n,
    1,
  );
});
test("personal deletion never resurrects a consumed delivery; new sends receive once without another ad", async () => {
  const f = await ready(),
    own = await received(f, f.own, f.a),
    v = await received(f, f.visitor, f.c),
    mutation = randomUUID();
  assert.equal((await sendRecord(f, f.visitor)).data.error, "already_received");
  assert.equal((await deleteRecord(v.receipt, f.c, mutation)).status, 200);
  assert.equal(
    (await deleteRecord(v.receipt, f.c, mutation)).data.receipt.status,
    "deleted",
  );
  assert.equal(
    (await req("/api/records/" + v.receipt.receipt_id, f.c.token)).data.sheet,
    null,
  );
  assert.equal((await req("/api/records", f.c.token)).data.items.length, 0);
  assert.equal(
    (await req("/api/record-inbox", f.c.token)).data.items.length,
    0,
  );
  assert.equal((await receiveExec(v.a, f.c)).data.receipt.status, "deleted");
  assert.equal(
    (await req("/api/records/" + own.receipt.receipt_id, f.a.token)).data.sheet
      .players.length,
    2,
  );
  assert.equal((await snapshot(f)).scores.length, 2);
  const newDelivery = (await sendRecord(f, f.visitor)).data.delivery;
  assert.notEqual(newDelivery.delivery_id, v.delivery.delivery_id);
  assert.equal(
    (await req("/api/record-inbox", f.c.token)).data.items.length,
    1,
  );
  const a = await receiveAction(newDelivery, f.c);
  assert.equal(a.ad_settled, true);
  const latest = (await receiveExec(a, f.c)).data.receipt;
  assert.notEqual(latest.receipt_id, v.receipt.receipt_id);
  await deleteRecord(v.receipt, f.c, mutation);
  assert.equal(
    (await req("/api/records", f.c.token)).data.items[0].receipt_id,
    latest.receipt_id,
  );
  assert.equal((await req("/api/home", f.a.token)).data.ended_rounds.length, 0);
});
test("cancel during an ad blocks receive but retains settlement for a new delivery", async () => {
  const f = await ready(),
    v = (await sendRecord(f, f.visitor)).data.delivery,
    a = await receiveAction(v, f.c);
  assert.equal((await cancelDelivery(v, f.a)).status, 200);
  assert.equal((await receiveAd(a, f.c, "show_failed")).status, 200);
  assert.equal((await receiveExec(a, f.c)).data.error, "delivery_unavailable");
  const next = (await sendRecord(f, f.visitor)).data.delivery,
    b = await receiveAction(next, f.c);
  assert.equal(b.ad_settled, true);
  assert.equal((await receiveExec(b, f.c)).status, 201);
  assert.equal(
    (await cancelDelivery(next, f.a)).data.error,
    "delivery_received",
  );
});
async function unlink(f: any, p: any) {
  return req(
    f.path + "/players/" + p.slot_id,
    f.a.token,
    {
      mutation_id: randomUUID(),
      version: p.version,
      action: "unlink",
      name: "임시 이름",
    },
    "PATCH",
  );
}
test("unlink cancels pending deliveries atomically and preserves scores and previously received records", async () => {
  const f = await ready(),
    v = (await sendRecord(f, f.visitor)).data.delivery,
    a = await receiveAction(v, f.c);
  assert.equal((await unlink(f, f.visitor)).status, 200);
  assert.equal((await receiveAd(a, f.c)).status, 200);
  assert.equal((await receiveExec(a, f.c)).data.error, "delivery_unavailable");
  assert.equal(
    (await req("/api/record-inbox", f.c.token)).data.items.length,
    0,
  );
  const p = await link(f, 1, f.c),
    old = await received(f, p, f.c);
  assert.equal((await unlink(f, p)).status, 200);
  const detail = (
    await req("/api/records/" + old.receipt.receipt_id, f.c.token)
  ).data;
  assert.equal(detail.receipt.status, "received");
  assert.equal(detail.current_player, false);
  assert.equal(detail.sheet.scores.length, 2);
  assert.equal(
    (await receiveExec(old.a, f.c)).data.receipt.receipt_id,
    old.receipt.receipt_id,
  );
});
test("simultaneous receives and lost-response replay create one receipt; another action sees completion even after deletion", async () => {
  const f = await ready(),
    v = (await sendRecord(f, f.visitor)).data.delivery,
    a = await receiveAction(v, f.c),
    b = await receiveAction(v, f.c);
  await receiveAd(a, f.c);
  const results = await Promise.all([
    receiveExec(a, f.c),
    receiveExec(a, f.c),
    receiveExec(b, f.c),
  ]);
  assert.ok(
    results.every((r) => [200, 201].includes(r.status)),
    JSON.stringify(results),
  );
  assert.equal(new Set(results.map((r) => r.data.receipt.receipt_id)).size, 1);
  const r = results[0].data.receipt;
  await deleteRecord(r, f.c);
  const state = (await req("/api/receipt-actions/" + b.action_id, f.c.token))
    .data;
  assert.equal(state.completed_receipt.status, "deleted");
  assert.equal((await receiveExec(b, f.c)).data.receipt.status, "deleted");
  assert.equal(
    (
      await db
        .prepare("SELECT COUNT(*) n FROM receipts WHERE delivery_id=?")
        .bind(v.delivery_id)
        .first<any>()
    ).n,
    1,
  );
});
test("receive versus cancel and unlink cannot leave an actionable stale delivery", async () => {
  const f = await ready(),
    v = (await sendRecord(f, f.visitor)).data.delivery,
    a = await receiveAction(v, f.c);
  await receiveAd(a, f.c);
  const [receive, cancel] = await Promise.all([
    receiveExec(a, f.c),
    cancelDelivery(v, f.a),
  ]);
  assert.ok(
    (receive.status === 201 && cancel.data.error === "delivery_received") ||
      (cancel.status === 200 && receive.data.error === "delivery_unavailable"),
    JSON.stringify([receive, cancel]),
  );
  assert.equal(
    (await req("/api/record-inbox", f.c.token)).data.items.length,
    0,
  );
  if (receive.status === 201) await deleteRecord(receive.data.receipt, f.c);
  const next = (await sendRecord(f, f.visitor)).data.delivery,
    b = await receiveAction(next, f.c);
  const [result, unlinked] = await Promise.all([
    receiveExec(b, f.c),
    unlink(f, f.visitor),
  ]);
  assert.equal(unlinked.status, 200);
  assert.ok(
    result.status === 201 || result.data.error === "delivery_unavailable",
  );
  assert.equal(
    (await req("/api/record-inbox", f.c.token)).data.items.length,
    0,
  );
});
test("foreign callers cannot send, cancel, receive, or delete records; moved devices lose write access", async () => {
  const f = await ready(),
    stranger = await user();
  assert.equal((await sendRecord(f, f.visitor, {}, f.c)).status, 403);
  const v = (await sendRecord(f, f.visitor)).data.delivery,
    a = await receiveAction(v, f.c);
  assert.equal((await cancelDelivery(v, stranger)).status, 403);
  assert.equal((await receiveExec(a, f.b)).status, 404);
  assert.equal(
    (
      await req("/api/receipt-actions/" + a.action_id + "/execute", f.c.token, {
        user_id: f.a.user_id,
      })
    ).data.error,
    "user_changed",
  );
  await receiveAd(a, f.c);
  const r = (await receiveExec(a, f.c)).data.receipt;
  assert.equal((await deleteRecord(r, f.a)).status, 404);
  await db
    .prepare("UPDATE devices SET revoked_at=? WHERE user_id=?")
    .bind(Date.now(), f.c.user_id)
    .run();
  assert.equal((await deleteRecord(r, f.c)).status, 401);
});
test("production rejects test ad outcomes and valid outage outcomes only settle a single per-round ad", async () => {
  const f = await ready(),
    v = (await sendRecord(f, f.visitor)).data.delivery,
    a = await receiveAction(v, f.c);
  const worker = (await import("../src/index")).default;
  const production = await worker.fetch(
    new Request("https://api.test/api/receipt-actions/" + a.action_id + "/ad", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + f.c.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user_id: f.c.user_id, outcome: "unavailable" }),
    }),
    {
      DB: db as any,
      ENVIRONMENT: "production",
      ALLOWED_ORIGINS: "https://app.test",
    },
  );
  assert.equal(((await production.json()) as any).error, "ads_not_configured");
  for (const result of [
    "completed",
    "unavailable",
    "load_failed",
    "show_failed",
    "load_timeout",
  ])
    assert.equal((await receiveAd(a, f.c, result)).status, 200);
  assert.equal(
    (
      await db
        .prepare(
          "SELECT COUNT(*) n FROM round_ad_settlements WHERE user_id=? AND round_id=?",
        )
        .bind(f.c.user_id, f.r.round_id)
        .first<any>()
    ).n,
    1,
  );
});
test("cursor lists are scoped to owner and include all records with equal timestamps without duplicates", async () => {
  const a = await user(),
    b = await user(),
    at = Date.now();
  const ids: string[] = [];
  for (let i = 0; i < 23; i++) {
    const r = randomUUID(),
      p = randomUUID(),
      v = randomUUID();
    ids.push(v);
    await db.batch([
      db
        .prepare(
          "INSERT INTO rounds(round_id,creator_id,join_code,course_snapshot,hole_count,status,created_at,updated_at,ended_at) VALUES(?,?,?,?,18,'ended',?,?,?)",
        )
        .bind(
          r,
          a.user_id,
          randomUUID(),
          JSON.stringify({ name: "Course", segments: [] }),
          at,
          at,
          at,
        ),
      db
        .prepare(
          "INSERT INTO player_slots(slot_id,round_id,user_id,name,position) VALUES(?,?,?,'P',0)",
        )
        .bind(p, r, b.user_id),
      db
        .prepare(
          "INSERT INTO deliveries(delivery_id,round_id,slot_id,sender_id,recipient_id,status,created_at) VALUES(?,?,?,?,?,'pending',?)",
        )
        .bind(v, r, p, a.user_id, b.user_id, at),
    ]);
  }
  const first = (await req("/api/record-inbox", b.token)).data,
    second = (
      await req("/api/record-inbox?before=" + first.next_cursor, b.token)
    ).data;
  assert.equal(first.items.length, 20);
  assert.equal(second.items.length, 3);
  assert.equal(
    new Set([...first.items, ...second.items].map((r: any) => r.delivery_id))
      .size,
    23,
  );
  assert.equal(second.next_cursor, null);
  assert.equal((await req("/api/record-inbox", a.token)).data.items.length, 0);
  for (const v of ids)
    await db.batch([
      db
        .prepare(
          "INSERT INTO receipts(receipt_id,round_id,user_id,player_slot_id,delivery_id,status,received_at) SELECT ?,round_id,recipient_id,slot_id,delivery_id,'received',? FROM deliveries WHERE delivery_id=?",
        )
        .bind(randomUUID(), at, v),
      db
        .prepare("UPDATE deliveries SET status='received' WHERE delivery_id=?")
        .bind(v),
    ]);
  const records = (await req("/api/records", b.token)).data,
    last = (await req("/api/records?before=" + records.next_cursor, b.token))
      .data;
  assert.equal(records.items.length, 20);
  assert.equal(last.items.length, 3);
  assert.equal((await req("/api/record-inbox", b.token)).data.items.length, 0);
});

test("stage 6 upgrade preserves existing round ads and data while adding receive settlements", async () => {
  const previous = mf,
    previousDB = db;
  const legacy = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      scriptPath: ".tmp/records-worker.mjs",
      compatibilityDate: "2026-09-23",
      d1Databases: ["DB"],
      bindings: { ENVIRONMENT: "test", ALLOWED_ORIGINS: "https://app.test" },
    }),
  );
  try {
    mf = legacy;
    db = await mf.getD1Database("DB");
    const files = (await readdir("migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort();
    async function apply(file: string) {
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
    for (const file of files.filter((f) => !f.startsWith("0006")))
      await apply(file);
    const a = await user(),
      c = await course(a.token),
      r = await create(a.token, c);
    const before = await db
      .prepare(
        "SELECT * FROM round_ad_settlements WHERE user_id=? AND round_id=?",
      )
      .bind(a.user_id, r.round_id)
      .first<any>();
    await apply(files.find((f) => f.startsWith("0006"))!);
    const after = await db
      .prepare(
        "SELECT * FROM round_ad_settlements WHERE user_id=? AND round_id=?",
      )
      .bind(a.user_id, r.round_id)
      .first<any>();
    assert.equal(after.action_id, before.action_id);
    assert.equal(after.outcome, before.outcome);
    assert.equal(after.settled_at, before.settled_at);
    assert.equal(after.receive_action_id, null);
    assert.equal(
      (await req("/api/home", a.token)).data.active_round.round_id,
      r.round_id,
    );
    assert.equal(
      (await db.prepare("PRAGMA foreign_key_check").all()).results.length,
      0,
    );
  } finally {
    mf = previous;
    db = previousDB;
    await legacy.dispose();
  }
});

// History fixtures are deliberately inserted into test D1; no production calculation exists yet.
async function peoriaFixture() {
  const f = await fixture(2);
  for (let h = 1; h <= 18; h++) {
    const saved = await save(
      f,
      write(await snapshot(f), [4, h === 1 ? 7 : null], h),
    );
    assert.equal(saved.status, 200);
  }
  await end(f);
  const own = await link(f, 0, f.a),
    visitor = await link(f, 1, f.c);
  return { ...f, own, visitor };
}
async function seedPeoria(f: any, ordinal = 1, mutate?: (v: any) => void) {
  const v = {
    run_id: randomUUID(),
    round_id: f.r.round_id,
    ordinal,
    calculated_at: Date.now(),
    actor_id: f.a.user_id,
    actor_name: "계산 당시 이름",
    source_record_version: (await ending(f)).record_version,
    algorithm_version: "test-fixture-only",
    snapshot: {
      course_name: "계산 당시 골프장",
      pars: Array(18).fill(4),
      players: [
        {
          slot_id: f.own.slot_id,
          user_id: f.a.user_id,
          name: "선수 A",
          scores: Array(18).fill(4),
        },
        {
          slot_id: f.visitor.slot_id,
          user_id: f.c.user_id,
          name: "선수 B",
          scores: [7, ...Array(17).fill(null)],
        },
      ],
    },
    target_slot_ids: [f.own.slot_id],
    excluded_slot_ids: [f.visitor.slot_id],
    results: [
      { slot_id: f.own.slot_id, gross: 72, handicap: 0, net: 72, rank: 1 },
    ],
  };
  mutate?.(v);
  await db
    .prepare(
      `INSERT INTO peoria_runs(run_id,round_id,ordinal,calculated_at,actor_id,actor_name,
    source_record_version,algorithm_version,snapshot_json,target_slots_json,excluded_slots_json,results_json,
    hidden_holes_json,request_id,request_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      v.run_id,
      v.round_id,
      v.ordinal,
      v.calculated_at,
      v.actor_id,
      v.actor_name,
      v.source_record_version,
      v.algorithm_version,
      JSON.stringify(v.snapshot),
      JSON.stringify(v.target_slot_ids),
      JSON.stringify(v.excluded_slot_ids),
      JSON.stringify(v.results),
      JSON.stringify([1, 2, 3, 4, 5, 6, 10, 11, 12, 13, 14, 15]),
      randomUUID(),
      "PRIVATE-REQUEST-HASH",
    )
    .run();
  return v;
}
test("Peoria history requires an ended round and membership or a current receipt; calculation stays unavailable", async () => {
  const f = await fixture(2);
  assert.equal(
    (await req(f.path + "/peoria", f.a.token)).data.error,
    "round_not_ended",
  );
  await end(f);
  const history = await req(f.path + "/peoria", f.b.token);
  assert.equal(history.status, 200);
  assert.deepEqual(history.data.runs, []);
  assert.equal(history.data.latest_run_id, null);
  assert.deepEqual(history.data.calculation, {
    available: false,
    reason: "policy_pending",
  });
  assert.equal((await req(f.path + "/peoria", f.c.token)).status, 403);
  assert.equal((await req(f.path + "/peoria", f.a.token, {})).status, 404);
});
test("Peoria has at most three integer ordinals and returns latest first without overwriting old runs", async () => {
  const f = await peoriaFixture();
  const first = await seedPeoria(f, 1);
  const second = await seedPeoria(f, 2);
  const third = await seedPeoria(f, 3);
  await assert.rejects(seedPeoria(f, 4), /CHECK/);
  await assert.rejects(seedPeoria(f, 1.5), /CHECK/);
  await assert.rejects(seedPeoria(f, 1), /UNIQUE/);
  const h = (await req(f.path + "/peoria", f.a.token)).data;
  assert.deepEqual(h.runs, [third, second, first]);
  assert.equal(h.latest_run_id, third.run_id);
});
test("Peoria excludes private SQL columns and unknown nested JSON fields from both public read paths", async () => {
  const f = await peoriaFixture();
  const seeded = await seedPeoria(f, 1, (v) => {
    v.snapshot.hidden_holes = "PRIVATE-NESTED";
    v.snapshot.players[0].draw_seed = "PRIVATE-NESTED";
    v.results[0].hidden_sum = "PRIVATE-NESTED";
  });
  const receivedRecord = await received(f, f.visitor, f.c);
  for (const path of [
    f.path + "/peoria",
    "/api/records/" + receivedRecord.receipt.receipt_id,
  ]) {
    const r = await req(path, f.c.token);
    assert.equal(r.status, 200);
    const runs = r.data.runs ?? r.data.peoria_runs;
    assert.equal(runs[0].run_id, seeded.run_id);
    assert.equal(runs[0].snapshot.players[1].scores[1], null);
    const encoded = JSON.stringify(r.data);
    assert.doesNotMatch(
      encoded,
      /hidden_holes|draw_seed|hidden_sum|request_hash|request_id|PRIVATE/,
    );
  }
});
test("deleting a nonparticipant receipt removes Peoria access while preserving shared history", async () => {
  const f = await peoriaFixture();
  const run = await seedPeoria(f);
  assert.equal((await req(f.path + "/peoria", f.c.token)).status, 403);
  const result = await received(f, f.visitor, f.c);
  assert.equal((await req(f.path + "/peoria", f.c.token)).status, 200);
  assert.equal(
    (await req("/api/records/" + result.receipt.receipt_id, f.a.token)).status,
    404,
  );
  await deleteRecord(result.receipt, f.c);
  assert.equal((await req(f.path + "/peoria", f.c.token)).status, 403);
  assert.deepEqual(
    (await req("/api/records/" + result.receipt.receipt_id, f.c.token)).data
      .peoria_runs,
    [],
  );
  assert.equal(
    (await req(f.path + "/peoria", f.b.token)).data.runs[0].run_id,
    run.run_id,
  );
  await db
    .prepare("UPDATE devices SET revoked_at=? WHERE user_id=?")
    .bind(Date.now(), f.b.user_id)
    .run();
  assert.equal((await req(f.path + "/peoria", f.b.token)).status, 401);
});
test("own score correction and renamed users leave stored Peoria snapshots and results unchanged", async () => {
  const f = await peoriaFixture();
  const first = await seedPeoria(f);
  const result = await received(f, f.own, f.a);
  const path = "/api/records/" + result.receipt.receipt_id + "/scores";
  const view = (await req(path, f.a.token)).data;
  const changed = await req(
    path,
    f.a.token,
    {
      user_id: f.a.user_id,
      mutation_id: randomUUID(),
      player_slot_id: f.own.slot_id,
      slot_version: view.slot_version,
      hole: 1,
      strokes: 5,
      version: 1,
    },
    "PUT",
  );
  assert.equal(changed.status, 200, JSON.stringify(changed));
  await db
    .prepare("UPDATE users SET nickname=? WHERE user_id=?")
    .bind("새 닉네임", f.a.user_id)
    .run();
  const history = (await req(f.path + "/peoria", f.a.token)).data;
  assert.ok(history.record_version > first.source_record_version);
  assert.deepEqual(history.runs, [first]);
  const detail = (
    await req("/api/records/" + result.receipt.receipt_id, f.a.token)
  ).data;
  assert.deepEqual(detail.peoria_runs, [first]);
  assert.equal(
    detail.sheet.scores.find(
      (s: any) => s.slot_id === f.own.slot_id && s.hole === 1,
    ).strokes,
    5,
  );
});
test("malformed history is rejected without echoing private stored data", async () => {
  const f = await peoriaFixture();
  await seedPeoria(f, 1, (v) => {
    v.snapshot.players[0].scores[0] = { hidden_holes: "PRIVATE-NESTED" };
  });
  const r = await req(f.path + "/peoria", f.a.token);
  assert.equal(r.status, 500);
  assert.equal(r.data.error, "peoria_history_invalid");
  assert.doesNotMatch(JSON.stringify(r.data), /PRIVATE|hidden_holes/);
});
