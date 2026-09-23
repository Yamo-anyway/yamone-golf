import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile, mkdir } from "node:fs/promises";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

let mf: Miniflare;
const secret = () => randomBytes(32).toString("hex");
const key = () =>
  "YMGF-" +
  Array.from(
    randomBytes(32),
    (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32],
  ).join("");
const registration = () => ({
  nickname: "야모",
  device_secret: secret(),
  recovery_key: key(),
  language: "system",
});
async function request(
  path: string,
  value?: unknown,
  token?: string,
  method?: string,
  extra: Record<string, string> = {},
) {
  const response = await mf.dispatchFetch("https://api.test" + path, {
    method: method ?? (value === undefined ? "GET" : "POST"),
    headers: {
      ...(value !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...extra,
    },
    body: value === undefined ? undefined : JSON.stringify(value),
  });
  return {
    status: response.status,
    headers: response.headers,
    data: (await response.json()) as any,
  };
}
before(async () => {
  await mkdir(".tmp", { recursive: true });
  await build({
    entryPoints: ["src/index.ts"],
    outfile: ".tmp/worker.mjs",
    bundle: true,
    format: "esm",
    platform: "neutral",
  });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      scriptPath: ".tmp/worker.mjs",
      compatibilityDate: "2026-09-23",
      d1Databases: ["DB"],
      bindings: { ENVIRONMENT: "test", ALLOWED_ORIGINS: "https://app.test" },
    }),
  );
  const db = await mf.getD1Database("DB");
  const sql = await readFile("migrations/0001_identity.sql", "utf8");
  const statements = sql
    .replace(/^--.*$/gm, "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  await db.batch(statements.map((s) => db.prepare(s)));
});
after(async () => {
  await mf?.dispose();
});
beforeEach(async () => {
  const db = await mf.getD1Database("DB");
  await db.batch(
    ["recovery_claims", "devices", "users", "request_limits"].map((table) =>
      db.prepare(`DELETE FROM ${table}`),
    ),
  );
});
test("health checks D1 and exposes no secrets", async () => {
  const r = await request("/health");
  assert.equal(r.status, 200);
  assert.equal(r.data.status, "ok");
  assert.equal(r.headers.get("Cache-Control"), "no-store");
});
test("duplicate nicknames create distinct users; a restart uses the same user and public code", async () => {
  const a = registration(),
    b = registration();
  const first = await request("/api/users", a),
    second = await request("/api/users", b);
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.notEqual(first.data.profile.user_id, second.data.profile.user_id);
  assert.notEqual(
    first.data.profile.personal_code,
    second.data.profile.personal_code,
  );
  const resumed = await request("/api/me", undefined, a.device_secret);
  assert.deepEqual(resumed.data.profile, first.data.profile);
  assert.equal(
    resumed.data.profile.personal_qr,
    "yamone-golf://player/" + resumed.data.profile.personal_code,
  );
});
test("concurrent registration retries create exactly one USER and one active device", async () => {
  const payload = registration();
  const results = await Promise.all(
    Array.from({ length: 6 }, () => request("/api/users", payload)),
  );
  assert.ok(
    results.every((r) => r.status === 200 || r.status === 201),
    JSON.stringify(results),
  );
  assert.equal(new Set(results.map((r) => r.data.profile.user_id)).size, 1);
  const db = await mf.getD1Database("DB");
  assert.equal(
    (await db.prepare("SELECT count(*) AS n FROM users").first<any>())!.n,
    1,
  );
  assert.equal(
    (await db
      .prepare("SELECT count(*) AS n FROM devices WHERE revoked_at IS NULL")
      .first<any>())!.n,
    1,
  );
});
test("nickname/language updates preserve identity and reject invalid values", async () => {
  const p = registration(),
    created = await request("/api/users", p);
  const updated = await request(
    "/api/me",
    { nickname: "새 야모", language: "en" },
    p.device_secret,
    "PATCH",
  );
  assert.equal(updated.status, 200);
  assert.equal(updated.data.profile.nickname, "새 야모");
  assert.equal(updated.data.profile.user_id, created.data.profile.user_id);
  assert.equal(
    updated.data.profile.personal_code,
    created.data.profile.personal_code,
  );
  for (const value of [
    { nickname: "" },
    { nickname: "x".repeat(17) },
    { language: "ja" },
  ])
    assert.equal(
      (await request("/api/me", value, p.device_secret, "PATCH")).status,
      400,
    );
});
test("public IDs and personal codes cannot authenticate; DB stores only secret hashes", async () => {
  const p = registration(),
    r = await request("/api/users", p);
  for (const token of [
    r.data.profile.user_id,
    r.data.profile.personal_code,
    secret(),
  ])
    assert.equal((await request("/api/me", undefined, token)).status, 401);
  const db = await mf.getD1Database("DB");
  const users = await db.prepare("SELECT * FROM users").all(),
    devices = await db.prepare("SELECT * FROM devices").all();
  const stored = JSON.stringify([users.results, devices.results]);
  assert.ok(!stored.includes(p.device_secret));
  assert.ok(!stored.includes(p.recovery_key));
  assert.ok(!JSON.stringify(r.data).includes("recovery_hash"));
});
test("recovery replaces the active device atomically, rotates the key, and retains user data", async () => {
  const p = registration(),
    created = await request("/api/users", p);
  const claim = {
    recovery_key: p.recovery_key.toLowerCase(),
    next_recovery_key: key(),
    device_secret: secret(),
  };
  const restored = await request("/api/recovery/claim", claim);
  assert.equal(restored.status, 200);
  assert.equal(restored.data.profile.user_id, created.data.profile.user_id);
  assert.equal(
    restored.data.profile.personal_code,
    created.data.profile.personal_code,
  );
  assert.equal(
    (await request("/api/me", undefined, p.device_secret)).data.error,
    "device_moved",
  );
  assert.equal(
    (
      await request(
        "/api/me",
        { nickname: "intruder" },
        p.device_secret,
        "PATCH",
      )
    ).status,
    401,
  );
  assert.equal(
    (await request("/api/recovery/claim", claim)).status,
    200,
    "lost-response retry must work",
  );
  assert.equal(
    (
      await request("/api/recovery/claim", {
        ...claim,
        device_secret: secret(),
      })
    ).status,
    400,
    "consumed key must fail",
  );
  const db = await mf.getD1Database("DB");
  assert.equal(
    (await db
      .prepare("SELECT count(*) AS n FROM devices WHERE revoked_at IS NULL")
      .first<any>())!.n,
    1,
  );
});
test("two simultaneous claims of one recovery key cannot activate two devices", async () => {
  const p = registration();
  await request("/api/users", p);
  const a = {
    recovery_key: p.recovery_key,
    next_recovery_key: key(),
    device_secret: secret(),
  };
  const b = {
    recovery_key: p.recovery_key,
    next_recovery_key: key(),
    device_secret: secret(),
  };
  const results = await Promise.all([
    request("/api/recovery/claim", a),
    request("/api/recovery/claim", b),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
  const db = await mf.getD1Database("DB");
  assert.equal(
    (await db
      .prepare("SELECT count(*) AS n FROM devices WHERE revoked_at IS NULL")
      .first<any>())!.n,
    1,
  );
});
test("failed recovery rolls back revocation of the working device", async () => {
  const p = registration();
  await request("/api/users", p);
  assert.equal(
    (
      await request("/api/recovery/claim", {
        recovery_key: key(),
        next_recovery_key: key(),
        device_secret: secret(),
      })
    ).status,
    400,
  );
  assert.equal(
    (await request("/api/me", undefined, p.device_secret)).status,
    200,
  );
});
test("web uses HttpOnly cookie; cookie mutations require a trusted Origin", async () => {
  const p = registration();
  const r = await request(
    "/api/users",
    { ...p, client: "web" },
    undefined,
    "POST",
    { Origin: "https://app.test" },
  );
  assert.equal(r.status, 201);
  const setCookie = r.headers.get("Set-Cookie")!;
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Secure/);
  assert.match(setCookie, /SameSite=Lax/);
  const cookie = setCookie.split(";")[0];
  assert.equal(
    (await request("/api/me", undefined, undefined, "GET", { Cookie: cookie }))
      .status,
    200,
  );
  assert.equal(
    (
      await request("/api/me", { nickname: "변경" }, undefined, "PATCH", {
        Cookie: cookie,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/api/me", { nickname: "변경" }, undefined, "PATCH", {
        Cookie: cookie,
        Origin: "https://bad.test",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/api/me", { nickname: "변경" }, undefined, "PATCH", {
        Cookie: cookie,
        Origin: "https://app.test",
      })
    ).status,
    200,
  );
});
test("invalid requests do not create users and repeated recovery attempts are limited", async () => {
  assert.equal(
    (await request("/api/users", { ...registration(), nickname: " " })).status,
    400,
  );
  assert.equal(
    (await request("/api/users", { ...registration(), device_secret: "weak" }))
      .status,
    400,
  );
  for (let i = 0; i < 15; i++)
    assert.equal(
      (
        await request("/api/recovery/claim", {
          recovery_key: key(),
          next_recovery_key: key(),
          device_secret: secret(),
        })
      ).status,
      400,
    );
  assert.equal(
    (
      await request("/api/recovery/claim", {
        recovery_key: key(),
        next_recovery_key: key(),
        device_secret: secret(),
      })
    ).status,
    429,
  );
});
