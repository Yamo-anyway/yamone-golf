import {
  type Env,
  type User,
  ApiError,
  assertActive,
  cookieName,
  device,
  json,
  now,
} from "./shared";

export async function profile(env: Env, userId: string) {
  const value = await env.DB.prepare(
    "SELECT user_id,nickname,personal_code,language,created_at,updated_at FROM users WHERE user_id=?",
  )
    .bind(userId)
    .first<User>();
  if (!value) throw new ApiError("unauthorized", 401);
  return {
    ...value,
    personal_qr: `yamone-golf://player/${value.personal_code}`,
  };
}

export async function identityResponse(
  request: Request,
  env: Env,
  token: string,
  client: unknown,
  status = 200,
) {
  const activeDevice = await device(env, token);
  assertActive(activeDevice);
  const response = json(
    {
      profile: await profile(env, activeDevice.user_id),
      server_time: now(),
    },
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
