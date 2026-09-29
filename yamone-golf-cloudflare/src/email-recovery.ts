import {
  ApiError,
  assertActive,
  authenticate,
  body,
  device,
  hash,
  json,
  limit,
  now,
  recovery,
  secret,
  type Env,
} from "./shared";
import { identityResponse } from "./identity-response";
import { uid } from "./round-store";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_TTL_MS = 15 * 60 * 1000;
const EMAIL_PATTERN = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

type EmailLanguage = "ko" | "en";
type VerificationRow = {
  request_id: string;
  user_id: string;
  email_normalized: string;
  email_hash: string;
  code_hash: string;
  language: EmailLanguage;
  status: "pending" | "sent" | "verified" | "failed";
  expires_at: number;
};
type RecoveryRow = {
  request_id: string;
  user_id: string | null;
  email_hash: string;
  code_hash: string | null;
  language: EmailLanguage;
  status: "accepted" | "sent" | "claimed" | "failed";
  expires_at: number;
};

function requestId(value: unknown) {
  return uid(value);
}

function email(value: unknown) {
  if (typeof value !== "string") throw new ApiError("invalid_email");
  const normalized = value.trim().toLowerCase();
  if (
    normalized.length > 254 ||
    !EMAIL_PATTERN.test(normalized) ||
    normalized.includes("..")
  )
    throw new ApiError("invalid_email");
  return normalized;
}

function emailLanguage(value: unknown): EmailLanguage {
  if (value === undefined || value === "system") return "en";
  if (value !== "ko" && value !== "en")
    throw new ApiError("invalid_language");
  return value;
}

function recoveryCode(value: unknown) {
  if (typeof value !== "string")
    throw new ApiError("invalid_email_recovery");
  const normalized = value.replace(/[\s-]/g, "").toUpperCase();
  if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/.test(normalized))
    throw new ApiError("invalid_email_recovery");
  return normalized;
}

function emailConfig(env: Env) {
  const mode = env.EMAIL_MODE ?? "disabled";
  if (mode === "disabled") throw new ApiError("email_not_configured", 503);
  if (!env.EMAIL_TOKEN_SECRET || env.EMAIL_TOKEN_SECRET.length < 32)
    throw new ApiError("email_not_configured", 503);
  if (!env.EMAIL_FROM || !env.EMAIL_APP_LINK)
    throw new ApiError("email_not_configured", 503);
  if (mode === "resend" && !env.RESEND_API_KEY)
    throw new ApiError("email_not_configured", 503);
  return {
    mode,
    from: env.EMAIL_FROM,
    appLink: env.EMAIL_APP_LINK,
    tokenSecret: env.EMAIL_TOKEN_SECRET,
  };
}

async function deriveCode(secretValue: string, context: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secretValue),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(context),
    ),
  );
  return Array.from(signature.slice(0, 12), (byte) =>
    CODE_ALPHABET.charAt(byte % CODE_ALPHABET.length),
  ).join("");
}

function maskEmail(value: string) {
  const [local, domain] = value.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}

function recoveryLink(
  base: string,
  request: string,
  code: string,
  kind: "verify" | "recover",
) {
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}kind=${kind}&request_id=${encodeURIComponent(request)}&code=${encodeURIComponent(code)}`;
}

function message(
  language: EmailLanguage,
  kind: "verify" | "recover",
  code: string,
  link: string,
) {
  if (language === "ko") {
    const purpose = kind === "verify" ? "복구 이메일 확인" : "계정 복구";
    return {
      subject: `[Yamone Golf] ${purpose} 코드`,
      text: `${purpose} 코드: ${code}\n\n앱에서 열기: ${link}\n\n이 코드는 15분 동안 유효합니다. 요청하지 않았다면 이 메일을 무시하세요.`,
      html: `<p>Yamone Golf ${purpose} 코드입니다.</p><p style="font-size:24px;font-weight:700;letter-spacing:3px">${code}</p><p><a href="${link}">Yamone Golf 앱에서 열기</a></p><p>이 코드는 15분 동안 유효합니다. 요청하지 않았다면 이 메일을 무시하세요.</p>`,
    };
  }
  const purpose = kind === "verify" ? "recovery email verification" : "account recovery";
  return {
    subject: `[Yamone Golf] ${purpose} code`,
    text: `Your ${purpose} code is ${code}.\n\nOpen the app: ${link}\n\nThis code expires in 15 minutes. Ignore this email if you did not request it.`,
    html: `<p>Your Yamone Golf ${purpose} code is:</p><p style="font-size:24px;font-weight:700;letter-spacing:3px">${code}</p><p><a href="${link}">Open Yamone Golf</a></p><p>This code expires in 15 minutes. Ignore this email if you did not request it.</p>`,
  };
}

async function sendEmail(
  env: Env,
  to: string,
  request: string,
  kind: "verify" | "recover",
  language: EmailLanguage,
  code: string,
) {
  const config = emailConfig(env);
  if (config.mode === "mock") return `mock-${request}`;
  const content = message(
    language,
    kind,
    code,
    recoveryLink(config.appLink, request, code, kind),
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `yamone-golf:${kind}:${request}`,
      },
      body: JSON.stringify({ from: config.from, to: [to], ...content }),
      signal: controller.signal,
    });
    const result = (await response.json().catch(() => null)) as {
      id?: unknown;
    } | null;
    if (!response.ok || typeof result?.id !== "string")
      throw new ApiError("email_delivery_failed", 502);
    return result.id;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("email_delivery_failed", 502);
  } finally {
    clearTimeout(timeout);
  }
}

function withTestCode(env: Env, value: Record<string, unknown>, code: string) {
  return env.EMAIL_MODE === "mock" && env.ENVIRONMENT !== "production"
    ? { ...value, test_code: code }
    : value;
}

async function status(request: Request, env: Env) {
  const activeDevice = await authenticate(request, env);
  const configured = (() => {
    try {
      emailConfig(env);
      return true;
    } catch {
      return false;
    }
  })();
  const row = await env.DB.prepare(
    "SELECT email_normalized,verified_at FROM user_recovery_emails WHERE user_id=?",
  )
    .bind(activeDevice.user_id)
    .first<{ email_normalized: string; verified_at: number }>();
  return json({
    configured,
    email_hint: row ? maskEmail(row.email_normalized) : null,
    verified_at: row?.verified_at ?? null,
    server_time: now(),
  });
}

async function requestVerification(request: Request, env: Env) {
  const config = emailConfig(env);
  const activeDevice = await authenticate(request, env);
  await limit(request, env, `email-verify:${activeDevice.user_id}`, 5, 3_600_000);
  const value = await body(request);
  const id = requestId(value.request_id);
  const normalized = email(value.email);
  const normalizedHash = await hash(normalized);
  const lang = emailLanguage(value.language);
  const existing = await env.DB.prepare(
    "SELECT * FROM email_verification_requests WHERE request_id=?",
  )
    .bind(id)
    .first<VerificationRow>();
  if (
    existing &&
    (existing.user_id !== activeDevice.user_id ||
      existing.email_hash !== normalizedHash)
  )
    throw new ApiError("request_reused", 409);
  if (existing?.status === "verified")
    return json({ status: "verified", server_time: now() });
  if (existing && existing.expires_at < now())
    throw new ApiError("request_expired", 409);
  const bound = await env.DB.prepare(
    "SELECT user_id FROM user_recovery_emails WHERE email_hash=?",
  )
    .bind(normalizedHash)
    .first<{ user_id: string }>();
  if (bound && bound.user_id !== activeDevice.user_id)
    throw new ApiError("email_in_use", 409);
  const code = await deriveCode(
    config.tokenSecret,
    `verify:${id}:${activeDevice.user_id}:${normalizedHash}`,
  );
  const codeHash = await hash(code);
  const time = now();
  if (!existing) {
    await env.DB.prepare(
      `INSERT INTO email_verification_requests(request_id,user_id,email_normalized,email_hash,code_hash,language,status,expires_at,created_at)
       SELECT ?,?,?,?,?,?,'pending',?,? WHERE EXISTS(SELECT 1 FROM devices WHERE token_hash=? AND revoked_at IS NULL)`,
    )
      .bind(
        id,
        activeDevice.user_id,
        normalized,
        normalizedHash,
        codeHash,
        lang,
        time + CODE_TTL_MS,
        time,
        activeDevice.token_hash,
      )
      .run();
  }
  let providerId: string;
  try {
    providerId = await sendEmail(env, normalized, id, "verify", lang, code);
  } catch (error) {
    await env.DB.prepare(
      "UPDATE email_verification_requests SET status='failed' WHERE request_id=? AND status<>'verified'",
    )
      .bind(id)
      .run();
    throw error;
  }
  await env.DB.prepare(
    "UPDATE email_verification_requests SET status='sent',provider_id=?,sent_at=? WHERE request_id=? AND status<>'verified'",
  )
    .bind(providerId, now(), id)
    .run();
  return json(
    withTestCode(
      env,
      { status: "sent", expires_at: existing?.expires_at ?? time + CODE_TTL_MS },
      code,
    ),
    202,
  );
}

async function verifyEmail(request: Request, env: Env) {
  emailConfig(env);
  const activeDevice = await authenticate(request, env);
  await limit(request, env, `email-confirm:${activeDevice.user_id}`, 10, 900_000);
  const value = await body(request);
  const id = requestId(value.request_id);
  const codeHash = await hash(recoveryCode(value.code));
  const row = await env.DB.prepare(
    "SELECT * FROM email_verification_requests WHERE request_id=?",
  )
    .bind(id)
    .first<VerificationRow>();
  if (
    !row ||
    row.user_id !== activeDevice.user_id ||
    row.status !== "sent" ||
    row.expires_at < now() ||
    row.code_hash !== codeHash
  )
    throw new ApiError("invalid_email_verification");
  const time = now();
  const guard = crypto.randomUUID();
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mutation_guards(guard_id,valid)
         VALUES(?,CASE WHEN EXISTS(
           SELECT 1 FROM email_verification_requests r
           JOIN devices d ON d.user_id=r.user_id
           WHERE r.request_id=? AND r.user_id=? AND r.status='sent' AND r.expires_at>=? AND r.code_hash=?
             AND d.token_hash=? AND d.revoked_at IS NULL
         ) THEN 1 ELSE 0 END)`,
      ).bind(
        guard,
        id,
        activeDevice.user_id,
        time,
        codeHash,
        activeDevice.token_hash,
      ),
      env.DB.prepare(
        `INSERT INTO user_recovery_emails(user_id,email_normalized,email_hash,verified_at,created_at,updated_at)
         VALUES(?,?,?,?,?,?)
         ON CONFLICT(user_id) DO UPDATE SET email_normalized=excluded.email_normalized,email_hash=excluded.email_hash,verified_at=excluded.verified_at,updated_at=excluded.updated_at`,
      ).bind(
        activeDevice.user_id,
        row.email_normalized,
        row.email_hash,
        time,
        time,
        time,
      ),
      env.DB.prepare(
        "UPDATE email_verification_requests SET status='verified',verified_at=? WHERE request_id=?",
      ).bind(time, id),
      env.DB.prepare("DELETE FROM mutation_guards WHERE guard_id=?").bind(guard),
    ]);
  } catch (error) {
    const stillActive = await env.DB.prepare(
      "SELECT 1 FROM devices WHERE token_hash=? AND revoked_at IS NULL",
    )
      .bind(activeDevice.token_hash)
      .first();
    if (!stillActive) {
      throw new ApiError("device_moved", 401);
    }
    if (/UNIQUE|CHECK/.test(String(error)))
      throw new ApiError("email_in_use", 409);
    throw error;
  }
  return json({
    status: "verified",
    email_hint: maskEmail(row.email_normalized),
    verified_at: time,
    server_time: time,
  });
}

async function requestRecovery(request: Request, env: Env) {
  const config = emailConfig(env);
  await limit(request, env, "email-recovery-request", 8, 900_000);
  const value = await body(request);
  const id = requestId(value.request_id);
  const normalized = email(value.email);
  const normalizedHash = await hash(normalized);
  const lang = emailLanguage(value.language);
  const existing = await env.DB.prepare(
    "SELECT * FROM email_recovery_requests WHERE request_id=?",
  )
    .bind(id)
    .first<RecoveryRow>();
  const accepted = { status: "accepted", expires_at: existing?.expires_at ?? now() + CODE_TTL_MS };
  if (existing && existing.email_hash !== normalizedHash)
    return json(accepted, 202);
  if (existing?.status === "claimed") return json(accepted, 202);
  if (existing && existing.expires_at < now()) return json(accepted, 202);
  const owner = await env.DB.prepare(
    "SELECT user_id FROM user_recovery_emails WHERE email_hash=?",
  )
    .bind(normalizedHash)
    .first<{ user_id: string }>();
  const code = await deriveCode(
    config.tokenSecret,
    `recover:${id}:${owner?.user_id ?? "unknown"}:${normalizedHash}`,
  );
  const codeHash = owner ? await hash(code) : null;
  const time = now();
  if (!existing) {
    await env.DB.prepare(
      `INSERT INTO email_recovery_requests(request_id,user_id,email_hash,code_hash,language,status,expires_at,created_at)
       VALUES(?,?,?,?,?,'accepted',?,?)`,
    )
      .bind(id, owner?.user_id ?? null, normalizedHash, codeHash, lang, time + CODE_TTL_MS, time)
      .run();
  }
  if (!owner) return json(accepted, 202);
  let providerId: string;
  try {
    providerId = await sendEmail(env, normalized, id, "recover", lang, code);
  } catch (error) {
    await env.DB.prepare(
      "UPDATE email_recovery_requests SET status='failed' WHERE request_id=? AND status<>'claimed'",
    )
      .bind(id)
      .run();
    // A provider outage must not reveal that this address belongs to a user.
    return json(accepted, 202);
  }
  await env.DB.prepare(
    "UPDATE email_recovery_requests SET status='sent',provider_id=?,sent_at=? WHERE request_id=? AND status<>'claimed'",
  )
    .bind(providerId, now(), id)
    .run();
  return json(
    withTestCode(env, accepted, code),
    202,
  );
}

async function claimRecovery(request: Request, env: Env) {
  emailConfig(env);
  const value = await body(request);
  const id = requestId(value.request_id);
  const token = secret(value.device_secret);
  if (value.client === "web" && !request.headers.get("Origin"))
    throw new ApiError("origin_required", 403);
  const current = await device(env, token);
  if (current) {
    assertActive(current);
    const claimed = await env.DB.prepare(
      "SELECT 1 FROM email_recovery_requests WHERE request_id=? AND user_id=? AND status='claimed'",
    )
      .bind(id, current.user_id)
      .first();
    if (!claimed || current.purpose !== "recovery")
      throw new ApiError("device_in_use", 409);
    return identityResponse(request, env, token, value.client);
  }
  await limit(request, env, "email-recovery-claim", 15, 900_000);
  const codeHash = await hash(recoveryCode(value.code));
  const nextHash = await hash(recovery(value.next_recovery_key));
  const tokenHash = await hash(token);
  const time = now();
  const guard = crypto.randomUUID();
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mutation_guards(guard_id,valid)
         VALUES(?,CASE WHEN EXISTS(
           SELECT 1 FROM email_recovery_requests
           WHERE request_id=? AND status='sent' AND user_id IS NOT NULL AND expires_at>=? AND code_hash=?
         ) THEN 1 ELSE 0 END)`,
      ).bind(guard, id, time, codeHash),
      env.DB.prepare(
        `INSERT INTO recovery_claims(token_hash,user_id,created_at)
         VALUES(?,(SELECT user_id FROM email_recovery_requests WHERE request_id=? AND status='sent' AND expires_at>=? AND code_hash=?),?)`,
      ).bind(tokenHash, id, time, codeHash, time),
      env.DB.prepare(
        "UPDATE devices SET revoked_at=? WHERE user_id=(SELECT user_id FROM recovery_claims WHERE token_hash=?) AND revoked_at IS NULL",
      ).bind(time, tokenHash),
      env.DB.prepare(
        `INSERT INTO devices(device_id,user_id,token_hash,purpose,created_at)
         VALUES(?,(SELECT user_id FROM recovery_claims WHERE token_hash=?),?,'recovery',?)`,
      ).bind(crypto.randomUUID(), tokenHash, tokenHash, time),
      env.DB.prepare(
        "UPDATE users SET recovery_hash=?,updated_at=? WHERE user_id=(SELECT user_id FROM recovery_claims WHERE token_hash=?)",
      ).bind(nextHash, time, tokenHash),
      env.DB.prepare(
        "UPDATE email_recovery_requests SET status='claimed',claimed_at=? WHERE request_id=?",
      ).bind(time, id),
      env.DB.prepare("DELETE FROM mutation_guards WHERE guard_id=?").bind(guard),
    ]);
  } catch (error) {
    const existingDevice = await device(env, token);
    if (existingDevice) {
      const claimed = await env.DB.prepare(
        "SELECT 1 FROM email_recovery_requests WHERE request_id=? AND user_id=? AND status='claimed'",
      )
        .bind(id, existingDevice.user_id)
        .first();
      if (claimed)
        return identityResponse(request, env, token, value.client);
    }
    if (/NOT NULL|UNIQUE|CHECK|FOREIGN KEY/.test(String(error)))
      throw new ApiError("invalid_email_recovery");
    throw error;
  }
  return identityResponse(request, env, token, value.client);
}

export async function emailRecoveryRoute(request: Request, env: Env) {
  const path = new URL(request.url).pathname;
  if (path === "/api/email-recovery" && request.method === "GET")
    return status(request, env);
  if (
    path === "/api/email-recovery/verification-requests" &&
    request.method === "POST"
  )
    return requestVerification(request, env);
  if (path === "/api/email-recovery/verify" && request.method === "POST")
    return verifyEmail(request, env);
  if (path === "/api/email-recovery/requests" && request.method === "POST")
    return requestRecovery(request, env);
  if (path === "/api/email-recovery/claim" && request.method === "POST")
    return claimRecovery(request, env);
  return null;
}
