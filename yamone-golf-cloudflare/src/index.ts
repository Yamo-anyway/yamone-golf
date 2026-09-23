export interface Env {
  DB: D1Database;
  ENVIRONMENT: string;
  ALLOWED_ORIGINS: string;
}
type User = {
  user_id: string;
  nickname: string;
  personal_code: string;
  language: "system" | "ko" | "en";
  created_at: number;
  updated_at: number;
};
type Device = {
  user_id: string;
  token_hash: string;
  revoked_at: number | null;
  purpose: string;
};
type Body = Record<string, unknown>;
const cookieName = "ymg_device_v3";
class ApiError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}
const json = (body: unknown, status = 200) => Response.json(body, { status });
const now = () => Date.now();
async function hash(value: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(bytes), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}
function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  // 32 symbols: uniform selection from cryptographic random bytes.
  return Array.from(
    crypto.getRandomValues(new Uint8Array(12)),
    (b) => alphabet[b % 32],
  ).join("");
}
function secret(value: unknown) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value))
    throw new ApiError("invalid_device");
  return value;
}
function recovery(value: unknown) {
  if (typeof value !== "string") throw new ApiError("invalid_recovery");
  const normalized = value.replace(/[\s-]/g, "").toUpperCase();
  if (!/^YMGF[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{32}$/.test(normalized))
    throw new ApiError("invalid_recovery");
  return normalized;
}
function nickname(value: unknown) {
  if (typeof value !== "string") throw new ApiError("invalid_nickname");
  const v = value.trim().normalize("NFC");
  if (!v || Array.from(v).length > 16 || /[\u0000-\u001f\u007f]/.test(v))
    throw new ApiError("invalid_nickname");
  return v;
}
function language(value: unknown): User["language"] {
  if (value === undefined) return "system";
  if (value !== "ko" && value !== "en" && value !== "system")
    throw new ApiError("invalid_language");
  return value;
}
async function body(request: Request): Promise<Body> {
  if (!request.headers.get("Content-Type")?.startsWith("application/json"))
    throw new ApiError("json_required", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError("invalid_request");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 8192) {
      await reader.cancel();
      throw new ApiError("request_too_large", 413);
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const result: unknown = JSON.parse(new TextDecoder().decode(all));
    if (!result || typeof result !== "object" || Array.isArray(result))
      throw new Error();
    return result as Body;
  } catch {
    throw new ApiError("invalid_request");
  }
}
async function limit(
  request: Request,
  env: Env,
  scope: string,
  max: number,
  windowMs: number,
) {
  // CF-Connecting-IP is supplied by Cloudflare; the fallback is for local development.
  const ip = request.headers.get("CF-Connecting-IP") ?? "local";
  const time = now();
  const start = Math.floor(time / windowMs) * windowMs;
  const bucket = `${scope}:${start}:${await hash(ip)}`;
  const row = await env.DB.prepare(
    `INSERT INTO request_limits(bucket,count,expires_at) VALUES(?,1,?)
    ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count`,
  )
    .bind(bucket, start + windowMs)
    .first<{ count: number }>();
  if (!row || row.count > max) throw new ApiError("rate_limited", 429);
}
async function device(env: Env, value: string) {
  return env.DB.prepare(
    "SELECT user_id,token_hash,revoked_at,purpose FROM devices WHERE token_hash=?",
  )
    .bind(await hash(value))
    .first<Device>();
}
function assertActive(d: Device | null): asserts d is Device {
  if (!d) throw new ApiError("unauthorized", 401);
  if (d.revoked_at !== null) throw new ApiError("device_moved", 401);
}
async function authenticate(request: Request, env: Env) {
  const authorization = request.headers.get("Authorization");
  let token: string | undefined;
  if (authorization !== null) {
    if (!/^Bearer [a-f0-9]{64}$/.test(authorization))
      throw new ApiError("unauthorized", 401);
    token = authorization.slice(7);
  } else {
    token = request.headers
      .get("Cookie")
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith(cookieName + "="))
      ?.slice(cookieName.length + 1);
    if (request.method !== "GET" && !request.headers.get("Origin"))
      throw new ApiError("origin_required", 403);
  }
  if (!token || !/^[a-f0-9]{64}$/.test(token))
    throw new ApiError("unauthorized", 401);
  const d = await device(env, token);
  assertActive(d);
  return d;
}
async function profile(env: Env, userId: string) {
  const p = await env.DB.prepare(
    "SELECT user_id,nickname,personal_code,language,created_at,updated_at FROM users WHERE user_id=?",
  )
    .bind(userId)
    .first<User>();
  if (!p) throw new ApiError("unauthorized", 401);
  return { ...p, personal_qr: `yamone-golf://player/${p.personal_code}` };
}
async function identityResponse(
  request: Request,
  env: Env,
  token: string,
  client: unknown,
  status = 200,
) {
  const d = await device(env, token);
  assertActive(d);
  const response = json(
    { profile: await profile(env, d.user_id), server_time: now() },
    status,
  );
  if (client === "web") {
    if (!request.headers.get("Origin"))
      throw new ApiError("origin_required", 403);
    const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
    response.headers.set(
      "Set-Cookie",
      `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`,
    );
  }
  return response;
}
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
      version: "0.3.0",
      environment: env.ENVIRONMENT,
      server_time: now(),
    });
  }
  if (path === "/api/users" && request.method === "POST")
    return register(request, env);
  if (path === "/api/recovery/claim" && request.method === "POST")
    return claim(request, env);
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
  throw new ApiError("not_found", 404);
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
        "GET, POST, PATCH, OPTIONS",
      );
    }
    return response;
  },
  async scheduled(_event: ScheduledController, env: Env) {
    // Stage 1 only cleans rate-limit buckets. Six-hour round expiry is Stage 8.
    await env.DB.prepare("DELETE FROM request_limits WHERE expires_at < ?")
      .bind(now())
      .run();
  },
} satisfies ExportedHandler<Env>;
