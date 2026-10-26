import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import worker from "../src/index";
import type { Env } from "../src/shared";
let db: DatabaseSync, env: Env;
class Prepared {
  constructor(
    readonly sql: string,
    readonly args: (string | number | null)[] = [],
  ) {}
  bind(...args: (string | number | null)[]) {
    return new Prepared(this.sql, args);
  }
  async first(column?: string) {
    const row = db.prepare(this.sql).get(...this.args);
    return column ? (row?.[column] ?? null) : (row ?? null);
  }
  async all() {
    return { success: true, results: db.prepare(this.sql).all(...this.args) };
  }
  async run() {
    return {
      success: true,
      meta: { changes: Number(db.prepare(this.sql).run(...this.args).changes) },
    };
  }
}
beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync("migrations")
    .filter((file) => file.endsWith(".sql"))
    .sort())
    db.exec(readFileSync(`migrations/${file}`, "utf8"));
  env = {
    ENVIRONMENT: "test",
    ALLOWED_ORIGINS: "",
    EMAIL_MODE: "mock",
    EMAIL_TOKEN_SECRET: "local-only-operations-test-token-secret-32bytes",
    EMAIL_FROM: "Yamone Golf <noreply@golf.yamone.net>",
    EMAIL_APP_LINK: "yamone-golf:///email-recovery",
    DB: {
      prepare: (sql: string) => new Prepared(sql),
      batch: async (statements: Prepared[]) => {
        db.exec("BEGIN");
        try {
          const results = await Promise.all(
            statements.map((statement) => statement.all()),
          );
          db.exec("COMMIT");
          return results;
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      },
    } as unknown as D1Database,
  };
});
afterEach(() => db.close());
async function api(path: string, value?: unknown, token?: string) {
  const response = await worker.fetch(
    new Request(`https://operations.test${path}`, {
      method: value === undefined ? "GET" : "POST",
      headers: {
        ...(value === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: value === undefined ? undefined : JSON.stringify(value),
    }),
    env,
  );
  return { status: response.status, data: (await response.json()) as any };
}
const deviceSecret = () => randomBytes(32).toString("hex");
const recoveryKey = () =>
  "YMGF" +
  Array.from(
    randomBytes(32),
    (byte) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[byte % 32],
  ).join("");
async function register() {
  const token = deviceSecret();
  const result = await api("/api/users", {
    nickname: "Local operations",
    device_secret: token,
    recovery_key: recoveryKey(),
    language: "ko",
  });
  assert.equal(result.status, 201);
  return { token, user: result.data.profile.user_id };
}
async function recoveryRequest(token: string) {
  const id = randomUUID();
  const verification = await api(
    "/api/email-recovery/verification-requests",
    { request_id: id, email: "operations@example.com", language: "ko" },
    token,
  );
  assert.equal(verification.status, 202);
  assert.equal(
    (
      await api(
        "/api/email-recovery/verify",
        { request_id: id, code: verification.data.test_code },
        token,
      )
    ).status,
    200,
  );
  const request_id = randomUUID();
  const result = await api("/api/email-recovery/requests", {
    request_id,
    email: "operations@example.com",
    language: "en",
  });
  assert.equal(result.status, 202);
  return { request_id, code: result.data.test_code };
}
test("production mock/unknown mode or missing Resend secret fails before queuing a fake email", async () => {
  const user = await register();
  env.ENVIRONMENT = "production";
  for (const mode of ["mock", "disabled", "typo", "resend"]) {
    env.EMAIL_MODE = mode as Env["EMAIL_MODE"];
    assert.equal(
      (await api("/api/email-recovery", undefined, user.token)).data.configured,
      false,
    );
    const result = await api(
      "/api/email-recovery/verification-requests",
      { request_id: randomUUID(), email: "operations@example.com" },
      user.token,
    );
    assert.equal(result.status, 503);
    assert.equal(result.data.error, "email_not_configured");
    assert.equal(result.data.test_code, undefined);
    assert.equal(
      (
        await api("/api/email-recovery/requests", {
          request_id: randomUUID(),
          email: "operations@example.com",
        })
      ).status,
      503,
    );
  }
  assert.equal(
    db
      .prepare("SELECT COUNT(*) AS count FROM email_verification_requests")
      .get()?.count,
    0,
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM email_recovery_requests").get()
      ?.count,
    0,
  );
  assert.equal((await api("/api/me", undefined, user.token)).status, 200);
});
test("expired email verification cannot bind an address or revoke an existing device", async () => {
  const user = await register(),
    request_id = randomUUID();
  const result = await api(
    "/api/email-recovery/verification-requests",
    { request_id, email: "operations@example.com" },
    user.token,
  );
  db.prepare(
    "UPDATE email_verification_requests SET expires_at=? WHERE request_id=?",
  ).run(Date.now() - 1, request_id);
  assert.equal(
    (
      await api(
        "/api/email-recovery/verify",
        { request_id, code: result.data.test_code },
        user.token,
      )
    ).status,
    400,
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM user_recovery_emails").get()
      ?.count,
    0,
  );
  assert.equal((await api("/api/me", undefined, user.token)).status, 200);
});
test("expired recovery preserves the working device, user data and recovery key", async () => {
  const user = await register(),
    request = await recoveryRequest(user.token);
  const before = db
    .prepare("SELECT * FROM users WHERE user_id=?")
    .get(user.user);
  db.prepare(
    "UPDATE email_recovery_requests SET expires_at=? WHERE request_id=?",
  ).run(Date.now() - 1, request.request_id);
  assert.equal(
    (
      await api("/api/email-recovery/claim", {
        ...request,
        device_secret: deviceSecret(),
        next_recovery_key: recoveryKey(),
      })
    ).status,
    400,
  );
  assert.deepEqual(
    db.prepare("SELECT * FROM users WHERE user_id=?").get(user.user),
    before,
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM mutation_guards").get()?.count,
    0,
  );
  assert.equal(
    db
      .prepare("SELECT COUNT(*) AS count FROM devices WHERE revoked_at IS NULL")
      .get()?.count,
    1,
  );
  assert.equal((await api("/api/me", undefined, user.token)).status, 200);
});
test("consumed recovery code cannot move the account to another device; original retry works", async () => {
  const user = await register(),
    request = await recoveryRequest(user.token);
  const token = deviceSecret();
  const claim = {
    ...request,
    device_secret: token,
    next_recovery_key: recoveryKey(),
  };
  assert.equal((await api("/api/email-recovery/claim", claim)).status, 200);
  assert.equal(
    (
      await api("/api/email-recovery/claim", {
        ...claim,
        device_secret: deviceSecret(),
        next_recovery_key: recoveryKey(),
      })
    ).status,
    400,
  );
  assert.equal((await api("/api/email-recovery/claim", claim)).status, 200);
  assert.equal((await api("/api/me", undefined, user.token)).status, 401);
  assert.equal(
    (await api("/api/me", undefined, token)).data.profile.user_id,
    user.user,
  );
  assert.equal(
    db
      .prepare("SELECT COUNT(*) AS count FROM devices WHERE revoked_at IS NULL")
      .get()?.count,
    1,
  );
});
