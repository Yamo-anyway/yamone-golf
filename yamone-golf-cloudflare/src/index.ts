import {
  type Env,
  ApiError,
  json,
  now,
  hash,
  randomCode,
  secret,
  recovery,
  nickname,
  language,
  body,
  limit,
  device,
  assertActive,
  authenticate,
  cookieName,
} from "./shared";
import { expireRounds } from "./round-store";
import { golfRoute } from "./golf";
import { emailRecoveryRoute } from "./email-recovery";
import { identityResponse, profile } from "./identity-response";
export type { Env } from "./shared";
async function register(request: Request, env: Env) {
  const b = await body(request);
  const token = secret(b.device_secret);
  if (b.client === "web" && !request.headers.get("Origin"))
    throw new ApiError("origin_required", 403);
  const old = await device(env, token);
  if (old) {
    assertActive(old);
    if (old.purpose !== "registration")
      throw new ApiError("device_in_use", 409);
    return identityResponse(request, env, token, b.client);
  }
  await limit(request, env, "register", 20, 3_600_000);
  const name = nickname(b.nickname),
    lang = language(b.language),
    recoveryHash = await hash(recovery(b.recovery_key));
  const tokenHash = await hash(token);
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = crypto.randomUUID(),
      time = now(),
      code = randomCode();
    try {
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO users(user_id,nickname,personal_code,language,recovery_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
        ).bind(id, name, code, lang, recoveryHash, time, time),
        env.DB.prepare(
          "INSERT INTO devices(device_id,user_id,token_hash,purpose,created_at) VALUES(?,?,?,'registration',?)",
        ).bind(crypto.randomUUID(), id, tokenHash, time),
      ]);
      return identityResponse(request, env, token, b.client, 201);
    } catch (error) {
      // A simultaneous retry may have committed first. Never create an orphan USER.
      if (await device(env, token))
        return identityResponse(request, env, token, b.client);
      if (String(error).includes("users.personal_code") && attempt < 2)
        continue;
      if (String(error).includes("users.recovery_hash"))
        throw new ApiError("key_in_use", 409);
      throw error;
    }
  }
  throw new ApiError("server_error", 500);
}
async function claim(request: Request, env: Env) {
  const b = await body(request),
    token = secret(b.device_secret);
  if (b.client === "web" && !request.headers.get("Origin"))
    throw new ApiError("origin_required", 403);
  const old = await device(env, token);
  if (old) {
    assertActive(old);
    if (old.purpose !== "recovery") throw new ApiError("device_in_use", 409);
    return identityResponse(request, env, token, b.client);
  }
  await limit(request, env, "recovery", 15, 900_000);
  const oldHash = await hash(recovery(b.recovery_key)),
    nextHash = await hash(recovery(b.next_recovery_key));
  if (oldHash === nextHash) throw new ApiError("invalid_recovery");
  const tokenHash = await hash(token),
    time = now();
  try {
    await env.DB.batch([
      // NULL violates NOT NULL if the key was consumed by another claim. The entire batch rolls back.
      env.DB.prepare(
        "INSERT INTO recovery_claims(token_hash,user_id,created_at) VALUES(?,(SELECT user_id FROM users WHERE recovery_hash=?),?)",
      ).bind(tokenHash, oldHash, time),
      env.DB.prepare(
        "UPDATE devices SET revoked_at=? WHERE user_id=(SELECT user_id FROM recovery_claims WHERE token_hash=?) AND revoked_at IS NULL",
      ).bind(time, tokenHash),
      env.DB.prepare(
        "INSERT INTO devices(device_id,user_id,token_hash,purpose,created_at) VALUES(?,(SELECT user_id FROM recovery_claims WHERE token_hash=?),?,'recovery',?)",
      ).bind(crypto.randomUUID(), tokenHash, tokenHash, time),
      env.DB.prepare(
        "UPDATE users SET recovery_hash=?,updated_at=? WHERE user_id=(SELECT user_id FROM recovery_claims WHERE token_hash=?)",
      ).bind(nextHash, time, tokenHash),
    ]);
  } catch (error) {
    const existing = await device(env, token);
    if (existing) return identityResponse(request, env, token, b.client);
    if (String(error).includes("NOT NULL") || String(error).includes("UNIQUE"))
      throw new ApiError("invalid_recovery");
    throw error;
  }
  return identityResponse(request, env, token, b.client);
}
async function route(request: Request, env: Env) {
  const path = new URL(request.url).pathname;
  if (path === "/health" && request.method === "GET") {
    await env.DB.prepare("SELECT 1 AS ok").first();
    return json({
      status: "ok",
      version: "0.3.11",
      environment: env.ENVIRONMENT,
      server_time: now(),
    });
  }
  if (path === "/api/users" && request.method === "POST")
    return register(request, env);
  if (path === "/api/recovery/claim" && request.method === "POST")
    return claim(request, env);
  const email = await emailRecoveryRoute(request, env);
  if (email) return email;
  if (path === "/api/me" && ["GET", "PATCH"].includes(request.method)) {
    const d = await authenticate(request, env);
    if (request.method === "PATCH") {
      const b = await body(request);
      if (b.nickname === undefined && b.language === undefined)
        throw new ApiError("invalid_request");
      const fields: string[] = [],
        values: (string | number)[] = [];
      if (b.nickname !== undefined) {
        fields.push("nickname=?");
        values.push(nickname(b.nickname));
      }
      if (b.language !== undefined) {
        fields.push("language=?");
        values.push(language(b.language));
      }
      fields.push("updated_at=?");
      values.push(now(), d.user_id, d.token_hash);
      // Re-check active device in the write itself; an earlier auth read is not sufficient.
      const changed = await env.DB.prepare(
        `UPDATE users SET ${fields.join(",")} WHERE user_id=? AND EXISTS(SELECT 1 FROM devices WHERE token_hash=? AND revoked_at IS NULL) RETURNING user_id`,
      )
        .bind(...values)
        .first();
      if (!changed) throw new ApiError("device_moved", 401);
    }
    return json({ profile: await profile(env, d.user_id), server_time: now() });
  }
  if (path === "/api/device/reset" && request.method === "POST") {
    const d = await authenticate(request, env);
    await env.DB.prepare(
      "UPDATE devices SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL",
    )
      .bind(now(), d.token_hash)
      .run();
    const response = json({ ok: true });
    response.headers.set(
      "Set-Cookie",
      `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    );
    return response;
  }
  return golfRoute(request, env);
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    const allowed =
      !!origin &&
      (origin === new URL(request.url).origin ||
        env.ALLOWED_ORIGINS?.split(",").includes(origin));
    let response: Response;
    try {
      if (origin && !allowed) throw new ApiError("origin_denied", 403);
      response =
        request.method === "OPTIONS"
          ? new Response(null, { status: 204 })
          : await route(request, env);
    } catch (error) {
      if (error instanceof ApiError)
        response = json({ error: error.code }, error.status);
      else {
        console.error(
          "Request failed",
          error instanceof Error ? error.name : "UnknownError",
        );
        response = json({ error: "server_error" }, 500);
      }
    }
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Vary", "Origin");
    if (allowed && origin) {
      response.headers.set("Access-Control-Allow-Origin", origin);
      response.headers.set("Access-Control-Allow-Credentials", "true");
      response.headers.set(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization",
      );
      response.headers.set(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      );
    }
    return response;
  },
  async scheduled(_event: ScheduledController, env: Env) {
    await expireRounds(env);
    const cutoff = now() - 7 * 24 * 60 * 60 * 1000;
    await env.DB.batch([
      env.DB
        .prepare("DELETE FROM request_limits WHERE expires_at < ?")
        .bind(now()),
      env.DB
        .prepare("DELETE FROM email_verification_requests WHERE created_at < ?")
        .bind(cutoff),
      env.DB
        .prepare(
          "DELETE FROM email_recovery_requests WHERE created_at < ?",
        )
        .bind(now() - 30 * 24 * 60 * 60 * 1000),
    ]);
  },
} satisfies ExportedHandler<Env>;
