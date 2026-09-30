export interface Env {
  DB: D1Database;
  ENVIRONMENT: string;
  ALLOWED_ORIGINS: string;
  EMAIL_MODE?: "mock" | "resend" | "disabled";
  EMAIL_FROM?: string;
  EMAIL_APP_LINK?: string;
  RESEND_API_KEY?: string;
  EMAIL_TOKEN_SECRET?: string;
  COURSE_ADMIN_TOKEN?: string;
  GOLFCORE_API?: Fetcher;
}
export type User = {
  user_id: string;
  nickname: string;
  personal_code: string;
  language: "system" | "ko" | "en";
  created_at: number;
  updated_at: number;
};
export type Device = {
  user_id: string;
  token_hash: string;
  revoked_at: number | null;
  purpose: string;
};
type Body = Record<string, unknown>;
export const cookieName = "ymg_device_v3";
export class ApiError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}
export const json = (body: unknown, status = 200) =>
  Response.json(body, { status });
export const now = () => Date.now();
export async function hash(value: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(bytes), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}
export function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  // 32 symbols: uniform selection from cryptographic random bytes.
  return Array.from(
    crypto.getRandomValues(new Uint8Array(12)),
    (b) => alphabet[b % 32],
  ).join("");
}
export function secret(value: unknown) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value))
    throw new ApiError("invalid_device");
  return value;
}
export function recovery(value: unknown) {
  if (typeof value !== "string") throw new ApiError("invalid_recovery");
  const normalized = value.replace(/[\s-]/g, "").toUpperCase();
  if (!/^YMGF[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{32}$/.test(normalized))
    throw new ApiError("invalid_recovery");
  return normalized;
}
export function nickname(value: unknown) {
  if (typeof value !== "string") throw new ApiError("invalid_nickname");
  const v = value.trim().normalize("NFC");
  if (!v || Array.from(v).length > 16 || /[\u0000-\u001f\u007f]/.test(v))
    throw new ApiError("invalid_nickname");
  return v;
}
export function language(value: unknown): User["language"] {
  if (value === undefined) return "system";
  if (value !== "ko" && value !== "en" && value !== "system")
    throw new ApiError("invalid_language");
  return value;
}
export async function body(request: Request): Promise<Body> {
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
export async function limit(
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
export async function device(env: Env, value: string) {
  return env.DB.prepare(
    "SELECT user_id,token_hash,revoked_at,purpose FROM devices WHERE token_hash=?",
  )
    .bind(await hash(value))
    .first<Device>();
}
export function assertActive(d: Device | null): asserts d is Device {
  if (!d) throw new ApiError("unauthorized", 401);
  if (d.revoked_at !== null) throw new ApiError("device_moved", 401);
}
export async function authenticate(request: Request, env: Env) {
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
