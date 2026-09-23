import { ApiError, type Env, type Device } from "./shared";

export type Round = {
  round_id: string;
  creator_id: string;
  join_code: string;
  course_snapshot: string;
  hole_count: number;
  status: string;
  created_at: number;
  updated_at: number;
};
export type Check = { sql: string; args?: (string | number | null)[] };
export const stmt = (
  env: Env,
  sql: string,
  ...args: (string | number | null)[]
) => env.DB.prepare(sql).bind(...args);
export const uid = (v: unknown) => {
  if (
    typeof v !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v)
  )
    throw new ApiError("invalid_request");
  return v;
};
export function revision(v: unknown) {
  if (!Number.isSafeInteger(v) || Number(v) < 0)
    throw new ApiError("invalid_request");
  return Number(v);
}
export async function getRound(env: Env, id: string) {
  const r = await stmt(
    env,
    "SELECT * FROM rounds WHERE round_id=?",
    id,
  ).first<Round>();
  if (!r) throw new ApiError("round_not_found", 404);
  return r;
}
export async function member(env: Env, d: Device, id: string) {
  if (
    !(await stmt(
      env,
      "SELECT 1 FROM round_participants WHERE round_id=? AND user_id=?",
      id,
      d.user_id,
    ).first())
  )
    throw new ApiError("forbidden", 403);
}
// D1 batch is transactional. Each CHECK failure rolls back all mutations, including earlier writes.
export async function atomic(
  env: Env,
  d: Device,
  checks: Check[],
  writes: D1PreparedStatement[],
  conflict = "state_changed",
) {
  const all = [
    {
      sql: "SELECT 1 FROM devices WHERE token_hash=? AND user_id=? AND revoked_at IS NULL",
      args: [d.token_hash, d.user_id],
    },
    ...checks,
  ];
  const ids = all.map(() => crypto.randomUUID());
  try {
    await env.DB.batch([
      ...all.map((c, i) =>
        stmt(
          env,
          `INSERT INTO mutation_guards(guard_id,valid) VALUES(?,CASE WHEN EXISTS(${c.sql}) THEN 1 ELSE 0 END)`,
          ids[i],
          ...(c.args ?? []),
        ),
      ),
      ...writes,
      ...ids.map((id) =>
        stmt(env, "DELETE FROM mutation_guards WHERE guard_id=?", id),
      ),
    ]);
  } catch (e) {
    if (
      !(await stmt(
        env,
        "SELECT 1 FROM devices WHERE token_hash=? AND revoked_at IS NULL",
        d.token_hash,
      ).first())
    )
      throw new ApiError("device_moved", 401);
    if (String(e).includes("active_round_users.user_id"))
      throw new ApiError("active_round_exists", 409);
    if (/CHECK|UNIQUE|FOREIGN KEY/.test(String(e)))
      throw new ApiError(conflict, 409);
    throw e;
  }
}
export const liveCheck = (id: string): Check => ({
  sql: "SELECT 1 FROM rounds WHERE round_id=? AND status='active'",
  args: [id],
});
