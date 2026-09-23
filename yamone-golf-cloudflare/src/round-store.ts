import { ApiError, now, type Env, type Device } from "./shared";

export type Round = {
  round_id: string;
  creator_id: string;
  join_code: string;
  course_snapshot: string;
  hole_count: number;
  status: string;
  created_at: number;
  updated_at: number;
  ended_at: number | null;
  record_version: number;
  permission_version: number;
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
  let r = await stmt(
    env,
    "SELECT * FROM rounds WHERE round_id=?",
    id,
  ).first<Round>();
  if (!r) throw new ApiError("round_not_found", 404);
  if (r.status === "active" && r.updated_at + INACTIVITY_MS <= now()) {
    await expireRounds(env, id);
    r = (await stmt(
      env,
      "SELECT * FROM rounds WHERE round_id=?",
      id,
    ).first<Round>())!;
  }
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
  sql: `SELECT 1 FROM rounds WHERE round_id=? AND status='active' AND updated_at > ${sqlNow} - ${INACTIVITY_MS}`,
  args: [id],
});

export const INACTIVITY_MS = 6 * 60 * 60 * 1000;
// SQLite evaluates this on the server within the mutation, including at the deadline.
const sqlNow = "CAST(unixepoch('subsec') * 1000 AS INTEGER)";
export function closeWrites(env: Env, batch: string) {
  return [
    stmt(
      env,
      `UPDATE rounds SET status='ended', ended_at=(SELECT ended_at FROM round_endings e WHERE e.round_id=rounds.round_id), record_version=record_version+1 WHERE round_id IN (SELECT round_id FROM round_endings WHERE batch_id=?) AND status='active'`,
      batch,
    ),
    stmt(
      env,
      `INSERT INTO round_completions(round_id,slot_id,holes_recorded,hole_count,complete)
      SELECT r.round_id,p.slot_id,COUNT(s.strokes),r.hole_count,CASE WHEN COUNT(s.strokes)=r.hole_count THEN 1 ELSE 0 END
      FROM round_endings e JOIN rounds r ON r.round_id=e.round_id
      JOIN player_slots p ON p.round_id=r.round_id AND p.deleted_at IS NULL
      LEFT JOIN scores s ON s.round_id=r.round_id AND s.slot_id=p.slot_id AND s.hole<=r.hole_count
      WHERE e.batch_id=? GROUP BY r.round_id,p.slot_id ON CONFLICT(round_id,slot_id) DO NOTHING`,
      batch,
    ),
    stmt(
      env,
      `DELETE FROM active_round_users WHERE round_id IN (SELECT round_id FROM round_endings WHERE batch_id=?)`,
      batch,
    ),
    stmt(
      env,
      `UPDATE round_invitations SET status='cancelled',updated_at=(SELECT ended_at FROM round_endings e WHERE e.round_id=round_invitations.round_id) WHERE status='pending' AND round_id IN (SELECT round_id FROM round_endings WHERE batch_id=?)`,
      batch,
    ),
  ];
}
export async function expireRounds(env: Env, id?: string) {
  const batch = crypto.randomUUID();
  // Selection and finalization share one transaction. A competing score either commits
  // first and extends activity, or is rejected by liveCheck after the end commits.
  await env.DB.batch([
    stmt(
      env,
      `INSERT INTO round_endings(round_id,batch_id,reason,actor_id,ended_at,processed_at)
      SELECT round_id,?,'inactivity',NULL,updated_at+${INACTIVITY_MS},${sqlNow}
      FROM rounds WHERE status='active' AND updated_at<=${sqlNow}-${INACTIVITY_MS}${id ? " AND round_id=?" : ""}
      ON CONFLICT(round_id) DO NOTHING`,
      batch,
      ...(id ? [id] : []),
    ),
    ...closeWrites(env, batch),
  ]);
}
