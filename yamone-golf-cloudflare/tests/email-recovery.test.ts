import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

let mf: Miniflare;
let db: Awaited<ReturnType<Miniflare["getD1Database"]>>;
const deviceSecret = () => randomBytes(32).toString("hex");
const recoveryKey = () =>
  "YMGF" +
  Array.from(
    randomBytes(32),
    (byte) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[byte % 32],
  ).join("");

async function request(
  path: string,
  value?: unknown,
  token?: string,
  method?: string,
) {
  const response = await mf.dispatchFetch(`https://api.test${path}`, {
    method: method ?? (value === undefined ? "GET" : "POST"),
    headers: {
      ...(value === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: value === undefined ? undefined : JSON.stringify(value),
  });
  return {
    status: response.status,
    data: (await response.json()) as Record<string, any>,
  };
}

async function register(nickname = "야모") {
  const token = deviceSecret();
  const key = recoveryKey();
  const response = await request("/api/users", {
    nickname,
    device_secret: token,
    recovery_key: key,
    language: "ko",
  });
  assert.equal(response.status, 201, JSON.stringify(response));
  return { token, key, profile: response.data.profile };
}

async function verifyRecoveryEmail(token: string, email: string) {
  const requestId = randomUUID();
  const requested = await request(
    "/api/email-recovery/verification-requests",
    { request_id: requestId, email, language: "ko" },
    token,
  );
  assert.equal(requested.status, 202, JSON.stringify(requested));
  assert.match(requested.data.test_code, /^[A-Z2-9]{12}$/);
  const verified = await request(
    "/api/email-recovery/verify",
    { request_id: requestId, code: requested.data.test_code },
    token,
  );
  assert.equal(verified.status, 200, JSON.stringify(verified));
  return verified.data;
}

before(async () => {
  await mkdir(".tmp", { recursive: true });
  await build({
    entryPoints: ["src/index.ts"],
    outfile: ".tmp/email-recovery-worker.mjs",
    bundle: true,
    format: "esm",
    platform: "neutral",
  });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      scriptPath: ".tmp/email-recovery-worker.mjs",
      compatibilityDate: "2026-09-23",
      d1Databases: ["DB"],
      bindings: {
        ENVIRONMENT: "test",
        ALLOWED_ORIGINS: "https://app.test",
        EMAIL_MODE: "mock",
        EMAIL_FROM: "Yamone Golf <noreply@golf.yamone.net>",
        EMAIL_APP_LINK: "yamone-golf://email-recovery",
        EMAIL_TOKEN_SECRET: "test-only-email-token-secret-32-bytes-minimum",
      },
    }),
  );
  db = await mf.getD1Database("DB");
  for (const file of (await readdir("migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(`migrations/${file}`, "utf8");
    await db.batch(
      sql
        .replace(/^--.*$/gm, "")
        .split(";")
        .map((statement) => statement.trim())
        .filter(Boolean)
        .map((statement) => db.prepare(statement)),
    );
  }
});

after(async () => {
  await mf?.dispose();
});

beforeEach(async () => {
  await db.batch(
    [
      "email_recovery_requests",
      "email_verification_requests",
      "user_recovery_emails",
      "recovery_claims",
      "devices",
      "users",
      "request_limits",
      "mutation_guards",
    ].map((table) => db.prepare(`DELETE FROM ${table}`)),
  );
});

test("authenticated user verifies a recovery email without storing the raw code", async () => {
  const user = await register();
  const initial = await request("/api/email-recovery", undefined, user.token);
  assert.deepEqual(
    {
      configured: initial.data.configured,
      email_hint: initial.data.email_hint,
      verified_at: initial.data.verified_at,
    },
    { configured: true, email_hint: null, verified_at: null },
  );

  const requestId = randomUUID();
  const sent = await request(
    "/api/email-recovery/verification-requests",
    { request_id: requestId, email: "Player@Example.com", language: "ko" },
    user.token,
  );
  assert.equal(sent.status, 202);
  assert.match(sent.data.test_code, /^[A-Z2-9]{12}$/);
  assert.equal(
    (
      await request(
        "/api/email-recovery/verify",
        { request_id: requestId, code: "AAAAAAAAAAAA" },
        user.token,
      )
    ).data.error,
    "invalid_email_verification",
  );
  const verified = await request(
    "/api/email-recovery/verify",
    { request_id: requestId, code: sent.data.test_code },
    user.token,
  );
  assert.equal(verified.status, 200);
  assert.equal(verified.data.email_hint, "p***@example.com");

  const stored = JSON.stringify(
    (
      await db
        .prepare("SELECT * FROM email_verification_requests")
        .all()
    ).results,
  );
  assert.ok(!stored.includes(sent.data.test_code));
});

test("one verified recovery email cannot be attached to two users", async () => {
  const first = await register("첫 번째");
  const second = await register("두 번째");
  await verifyRecoveryEmail(first.token, "owner@example.com");
  const conflict = await request(
    "/api/email-recovery/verification-requests",
    {
      request_id: randomUUID(),
      email: "OWNER@example.com",
      language: "en",
    },
    second.token,
  );
  assert.equal(conflict.status, 409);
  assert.equal(conflict.data.error, "email_in_use");
});

test("email recovery atomically replaces the active device and supports a lost-response retry", async () => {
  const user = await register();
  await verifyRecoveryEmail(user.token, "recover@example.com");
  const requestId = randomUUID();
  const requested = await request("/api/email-recovery/requests", {
    request_id: requestId,
    email: "recover@example.com",
    language: "en",
  });
  assert.equal(requested.status, 202);
  assert.equal(requested.data.status, "accepted");
  assert.match(requested.data.test_code, /^[A-Z2-9]{12}$/);

  const nextToken = deviceSecret();
  const nextKey = recoveryKey();
  const invalid = await request("/api/email-recovery/claim", {
    request_id: requestId,
    code: "AAAAAAAAAAAA",
    device_secret: nextToken,
    next_recovery_key: nextKey,
  });
  assert.equal(invalid.status, 400);
  assert.equal((await request("/api/me", undefined, user.token)).status, 200);

  const claim = {
    request_id: requestId,
    code: requested.data.test_code,
    device_secret: nextToken,
    next_recovery_key: nextKey,
  };
  const recovered = await request("/api/email-recovery/claim", claim);
  assert.equal(recovered.status, 200, JSON.stringify(recovered));
  assert.equal(recovered.data.profile.user_id, user.profile.user_id);
  assert.equal((await request("/api/me", undefined, user.token)).status, 401);
  assert.equal((await request("/api/me", undefined, nextToken)).status, 200);
  assert.equal(
    (await request("/api/email-recovery/claim", claim)).status,
    200,
    "the same device must recover after a lost response",
  );
  assert.equal(
    (
      await db
        .prepare("SELECT count(*) AS count FROM devices WHERE revoked_at IS NULL")
        .first<{ count: number }>()
    )?.count,
    1,
  );
});

test("unknown recovery emails receive the same public acceptance response and create no usable code", async () => {
  const requestId = randomUUID();
  const result = await request("/api/email-recovery/requests", {
    request_id: requestId,
    email: "missing@example.com",
    language: "en",
  });
  assert.equal(result.status, 202);
  assert.equal(result.data.status, "accepted");
  assert.equal(result.data.test_code, undefined);
  const row = await db
    .prepare(
      "SELECT user_id,code_hash,status FROM email_recovery_requests WHERE request_id=?",
    )
    .bind(requestId)
    .first<{ user_id: string | null; code_hash: string | null; status: string }>();
  assert.deepEqual(row, {
    user_id: null,
    code_hash: null,
    status: "accepted",
  });
});
