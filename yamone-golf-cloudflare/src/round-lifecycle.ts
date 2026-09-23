import {
  type Device,
  type Env,
  ApiError,
  body,
  hash,
  json,
  now,
} from "./shared";
import {
  atomic,
  closeWrites,
  getRound,
  liveCheck,
  member,
  revision,
  stmt,
  uid,
  type Round,
} from "./round-store";
import type { EndView } from "../../shared/round-ending";
async function view(env: Env, d: Device, id: string): Promise<EndView> {
  await getRound(env, id);
  const [rounds, players, participants] = await env.DB.batch([
    stmt(
      env,
      `SELECT r.*,e.reason,e.actor_id AS ended_by FROM rounds r LEFT JOIN round_endings e ON e.round_id=r.round_id WHERE r.round_id=?`,
      id,
    ),
    stmt(
      env,
      `SELECT p.slot_id,p.name,SUM(s.strokes) AS total_strokes,COUNT(s.strokes) AS holes_recorded FROM player_slots p JOIN rounds r ON r.round_id=p.round_id LEFT JOIN scores s ON s.round_id=p.round_id AND s.slot_id=p.slot_id AND s.hole<=r.hole_count WHERE p.round_id=? AND p.deleted_at IS NULL GROUP BY p.slot_id ORDER BY p.position`,
      id,
    ),
    stmt(
      env,
      `SELECT p.user_id,p.can_end,u.nickname,u.personal_code FROM round_participants p JOIN users u ON u.user_id=p.user_id WHERE p.round_id=? ORDER BY p.joined_at,p.user_id`,
      id,
    ),
  ]);
  const r = rounds.results[0] as unknown as Round &
    Pick<EndView, "reason" | "ended_by">;
  const people = participants.results as unknown as EndView["participants"];
  return {
    round_id: id,
    status: r.status as EndView["status"],
    hole_count: r.hole_count,
    record_version: r.record_version,
    permission_version: r.permission_version,
    updated_at: r.updated_at,
    ended_at: r.ended_at,
    reason: r.reason,
    ended_by: r.ended_by,
    is_creator: r.creator_id === d.user_id,
    can_end: !!people.find((p) => p.user_id === d.user_id)?.can_end,
    players: (
      players.results as unknown as {
        slot_id: string;
        name: string;
        holes_recorded: number;
        total_strokes: number | null;
      }[]
    ).map((p) => ({
      slot_id: String(p.slot_id),
      name: String(p.name),
      holes_recorded: Number(p.holes_recorded),
      total_strokes: p.total_strokes === null ? null : Number(p.total_strokes),
      complete: Number(p.holes_recorded) === r.hole_count,
    })),
    participants: people,
  };
}
async function replay(
  env: Env,
  d: Device,
  mutation: string,
  requestHash: string,
) {
  const old = await stmt(
    env,
    "SELECT request_hash FROM round_lifecycle_mutations WHERE user_id=? AND mutation_id=?",
    d.user_id,
    mutation,
  ).first<{ request_hash: string }>();
  if (old && old.request_hash !== requestHash)
    throw new ApiError("request_reused", 409);
  return !!old;
}
export async function lifecycleRoute(request: Request, env: Env, d: Device) {
  const match = new URL(request.url).pathname.match(
    /^\/api\/rounds\/([^/]+)\/(ending|end-permissions)$/,
  );
  if (!match) return null;
  const id = uid(match[1]),
    area = match[2];
  await member(env, d, id);
  if (request.method === "GET" && area === "ending")
    return json(await view(env, d, id));
  if (request.method !== "POST") throw new ApiError("not_found", 404);
  const b = await body(request);
  if (b.user_id !== d.user_id) throw new ApiError("user_changed", 409);
  const mutation = uid(b.mutation_id);
  const ending = area === "ending";
  const version = revision(ending ? b.record_version : b.permission_version);
  const target = ending ? null : uid(b.participant_id);
  if (!ending && typeof b.can_end !== "boolean")
    throw new ApiError("invalid_request");
  const payload = JSON.stringify(
    ending ? { id, version } : { id, version, target, can_end: b.can_end },
  );
  const requestHash = await hash(area + payload);
  if (await replay(env, d, mutation, requestHash))
    return json(await view(env, d, id));
  const current = await view(env, d, id);
  if (ending && current.status === "ended") return json(current);
  if (current.status !== "active") throw new ApiError("round_ended", 409);
  if (ending ? !current.can_end : !current.is_creator)
    throw new ApiError("end_forbidden", 403);
  if (
    version !== (ending ? current.record_version : current.permission_version)
  )
    throw new ApiError(ending ? "end_changed" : "permissions_changed", 409);
  if (
    !ending &&
    (target === d.user_id ||
      !current.participants.some((p) => p.user_id === target))
  )
    throw new ApiError("invalid_participant");
  const time = now(),
    batch = crypto.randomUUID();
  const checks = [
    liveCheck(id),
    ending
      ? {
          sql: "SELECT 1 FROM round_participants p JOIN rounds r ON r.round_id=p.round_id WHERE p.round_id=? AND p.user_id=? AND p.can_end=1 AND r.record_version=?",
          args: [id, d.user_id, version],
        }
      : {
          sql: "SELECT 1 FROM rounds r JOIN round_participants p ON p.round_id=r.round_id WHERE r.round_id=? AND r.creator_id=? AND r.permission_version=? AND p.user_id=? AND p.user_id<>r.creator_id",
          args: [id, d.user_id, version, target],
        },
  ];
  const writes = ending
    ? [
        stmt(
          env,
          "INSERT INTO round_endings(round_id,batch_id,reason,actor_id,ended_at,processed_at) VALUES(?,?,'manual',?,?,?)",
          id,
          batch,
          d.user_id,
          time,
          time,
        ),
        ...closeWrites(env, batch),
      ]
    : [
        stmt(
          env,
          "UPDATE round_participants SET can_end=? WHERE round_id=? AND user_id=?",
          b.can_end ? 1 : 0,
          id,
          target,
        ),
        stmt(
          env,
          "UPDATE rounds SET permission_version=permission_version+1 WHERE round_id=?",
          id,
        ),
      ];
  writes.push(
    stmt(
      env,
      "INSERT INTO round_lifecycle_mutations(user_id,mutation_id,round_id,request_hash,kind,payload_json,created_at) VALUES(?,?,?,?,?,?,?)",
      d.user_id,
      mutation,
      id,
      requestHash,
      ending ? "end" : "permission",
      payload,
      time,
    ),
  );
  try {
    await atomic(env, d, checks, writes);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) throw e;
    if (await replay(env, d, mutation, requestHash))
      return json(await view(env, d, id));
    const latest = await view(env, d, id);
    if (ending && latest.status === "ended") return json(latest);
    if (latest.status === "ended") throw new ApiError("round_ended", 409);
    if (ending && !latest.can_end) throw new ApiError("end_forbidden", 403);
    if (ending && latest.record_version !== version)
      throw new ApiError("end_changed", 409);
    if (!ending && latest.permission_version !== version)
      throw new ApiError("permissions_changed", 409);
    throw e;
  }
  return json(await view(env, d, id));
}
