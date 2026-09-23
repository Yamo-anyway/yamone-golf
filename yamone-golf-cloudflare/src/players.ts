import {
  ApiError,
  body,
  hash,
  json,
  limit,
  nickname,
  now,
  type Device,
  type Env,
} from "./shared";
import {
  atomic,
  getRound,
  liveCheck,
  member,
  revision,
  stmt,
  uid,
  type Check,
} from "./round-store";
import { normalizePersonalCode } from "../../shared/personal-code";
type Slot = {
  slot_id: string;
  round_id: string;
  user_id: string | null;
  name: string;
  position: number;
  version: number;
  deleted_at: number | null;
};
type Impact = {
  linked: number;
  score_count: number;
  delivery_count: number;
  receipt_count: number;
  target_count: number;
  player_count: number;
  version: number;
  roster_version: number;
};
async function slot(env: Env, round: string, id: string) {
  const s = await stmt(
    env,
    "SELECT * FROM player_slots WHERE round_id=? AND slot_id=? AND deleted_at IS NULL",
    round,
    id,
  ).first<Slot>();
  if (!s) throw new ApiError("player_not_found", 404);
  return s;
}
const liveMember = (round: string, d: Device): Check[] => [
  liveCheck(round),
  {
    sql: "SELECT 1 FROM round_participants WHERE round_id=? AND user_id=?",
    args: [round, d.user_id],
  },
];
async function roster(env: Env, round: string) {
  const results = await env.DB.batch<Record<string, unknown>>([
    stmt(
      env,
      "SELECT status,roster_version FROM rounds WHERE round_id=?",
      round,
    ),
    stmt(
      env,
      `SELECT p.slot_id,p.user_id,p.name AS temporary_name,COALESCE(u.nickname,p.name) AS name,p.position,p.version,u.personal_code,
  (SELECT count(*) FROM scores s WHERE s.slot_id=p.slot_id AND s.strokes IS NOT NULL) AS score_count,
  (SELECT count(*) FROM deliveries d WHERE d.slot_id=p.slot_id) AS delivery_count,
  (SELECT count(*) FROM receipts r WHERE r.player_slot_id=p.slot_id) AS receipt_count
  FROM player_slots p LEFT JOIN users u ON p.user_id=u.user_id WHERE p.round_id=? AND p.deleted_at IS NULL ORDER BY p.position`,
      round,
    ),
  ]);
  return { ...results[0].results[0], players: results[1].results };
}
async function targets(env: Env, round: string, d: Device) {
  const results = await env.DB.batch<Record<string, unknown>>([
    stmt(
      env,
      "SELECT status,roster_version FROM rounds WHERE round_id=?",
      round,
    ),
    stmt(
      env,
      "SELECT version FROM input_target_lists WHERE round_id=? AND user_id=?",
      round,
      d.user_id,
    ),
    stmt(
      env,
      "SELECT slot_id FROM input_targets WHERE round_id=? AND user_id=? ORDER BY sort_order,slot_id",
      round,
      d.user_id,
    ),
    stmt(
      env,
      "SELECT p.slot_id,p.user_id,COALESCE(u.nickname,p.name) AS name,p.position,u.personal_code FROM player_slots p LEFT JOIN users u ON u.user_id=p.user_id WHERE p.round_id=? AND p.deleted_at IS NULL ORDER BY p.position",
      round,
    ),
  ]);
  const list = results[1].results[0],
    players = results[3].results;
  return {
    ...results[0].results[0],
    version: list ? list.version : 0,
    customized: !!list,
    players,
    slot_ids: (list ? results[2].results : players).map((p) => p.slot_id),
  };
}
async function impact(env: Env, round: string, id: string) {
  const result = await stmt(
    env,
    `SELECT (p.user_id IS NOT NULL) AS linked,p.version,r.roster_version,
 (SELECT count(*) FROM scores WHERE slot_id=p.slot_id AND strokes IS NOT NULL) AS score_count,
 (SELECT count(*) FROM deliveries WHERE slot_id=p.slot_id) AS delivery_count,
 (SELECT count(*) FROM receipts WHERE player_slot_id=p.slot_id) AS receipt_count,
 (SELECT count(*) FROM input_targets WHERE slot_id=p.slot_id) AS target_count,
 (SELECT count(*) FROM player_slots WHERE round_id=p.round_id AND deleted_at IS NULL) AS player_count
 FROM player_slots p JOIN rounds r ON r.round_id=p.round_id WHERE p.round_id=? AND p.slot_id=? AND p.deleted_at IS NULL`,
    round,
    id,
  ).first<Impact>();
  if (!result) throw new ApiError("player_not_found", 404);
  return {
    ...result,
    can_delete:
      !result.linked &&
      !result.score_count &&
      !result.delivery_count &&
      !result.receipt_count &&
      result.player_count > 1,
  };
}
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.entries(v)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, value]) => [k, canonical(value)]),
    );
  return v;
}
async function replay(env: Env, d: Device, id: string, requestHash: string) {
  const old = await stmt(
    env,
    "SELECT request_hash FROM player_mutations WHERE user_id=? AND mutation_id=?",
    d.user_id,
    id,
  ).first<{ request_hash: string }>();
  if (!old) return false;
  if (old.request_hash !== requestHash)
    throw new ApiError("request_reused", 409);
  return true;
}
export async function playersRoute(
  request: Request,
  env: Env,
  d: Device,
): Promise<Response> {
  const path = new URL(request.url).pathname,
    method = request.method;
  const match = path.match(
    /^\/api\/rounds\/([^/]+)\/(players|input-targets|player-lookup)(?:\/([^/]+)(?:\/(delete-impact))?)?$/,
  );
  if (!match) throw new ApiError("not_found", 404);
  const round = uid(match[1]),
    area = match[2],
    id = match[3] ? uid(match[3]) : null;
  await member(env, d, round);
  if (method === "GET") {
    if (area === "players" && !id) return json(await roster(env, round));
    if (area === "players" && id && match[4])
      return json(await impact(env, round, id));
    if (area === "input-targets" && !id)
      return json(await targets(env, round, d));
    throw new ApiError("not_found", 404);
  }
  const b = await body(request);
  if (area === "player-lookup" && !id && method === "POST") {
    if ((await getRound(env, round)).status !== "active")
      throw new ApiError("round_ended", 409);
    await limit(request, env, `player-lookup:${d.user_id}`, 30, 60000);
    const code = normalizePersonalCode(b.code);
    if (!code) throw new ApiError("invalid_personal_code");
    const user = await stmt(
      env,
      "SELECT user_id,nickname,personal_code FROM users WHERE personal_code=?",
      code,
    ).first();
    if (!user) throw new ApiError("user_not_found", 404);
    const existing = await stmt(
      env,
      "SELECT slot_id FROM player_slots WHERE round_id=? AND user_id=? AND deleted_at IS NULL",
      round,
      String(user.user_id),
    ).first();
    return json({ user, linked_slot_id: existing?.slot_id ?? null });
  }
  if (!(
    (area === "players" &&
      ((!id && method === "POST") ||
        (id && !match[4] && ["PATCH", "DELETE"].includes(method)))) ||
    (area === "input-targets" && !id && method === "PATCH")
  ))
    throw new ApiError("not_found", 404);
  const mutationId = uid(b.mutation_id),
    requestHash = await hash(JSON.stringify(canonical([method, path, b])));
  const result = () =>
    area === "input-targets" ? targets(env, round, d) : roster(env, round);
  if (await replay(env, d, mutationId, requestHash))
    return json(await result());
  const renameOnly =
    area === "players" && !!id && method === "PATCH" && b.action === "rename";
  if (!renameOnly && (await getRound(env, round)).status !== "active")
    throw new ApiError("round_ended", 409);
  const checks = renameOnly
      ? liveMember(round, d).slice(1)
      : liveMember(round, d),
    writes: D1PreparedStatement[] = [];
  let failure = "player_changed";
  let old: Slot | null = null,
    after: unknown = null,
    kind = "";
  let slotId = id;
  if (area === "input-targets") {
    failure = "targets_changed";
    const version = revision(b.version),
      rosterVersion = revision(b.roster_version);
    if (!Array.isArray(b.slot_ids) || b.slot_ids.length > 8)
      throw new ApiError("invalid_targets");
    const ids = b.slot_ids.map(uid);
    if (new Set(ids).size !== ids.length) throw new ApiError("invalid_targets");
    checks.push(
      {
        sql: "SELECT 1 FROM rounds WHERE round_id=? AND roster_version=?",
        args: [round, rosterVersion],
      },
      {
        sql: "SELECT 1 WHERE COALESCE((SELECT version FROM input_target_lists WHERE round_id=? AND user_id=?),0)=?",
        args: [round, d.user_id, version],
      },
    );
    for (const target of ids)
      checks.push({
        sql: "SELECT 1 FROM player_slots WHERE round_id=? AND slot_id=? AND deleted_at IS NULL",
        args: [round, target],
      });
    writes.push(
      stmt(
        env,
        "INSERT INTO input_target_lists(round_id,user_id,version) VALUES(?,?,1) ON CONFLICT(round_id,user_id) DO UPDATE SET version=version+1",
        round,
        d.user_id,
      ),
      stmt(
        env,
        "DELETE FROM input_targets WHERE round_id=? AND user_id=?",
        round,
        d.user_id,
      ),
      ...ids.map((target, i) =>
        stmt(
          env,
          "INSERT INTO input_targets(round_id,user_id,slot_id,sort_order) VALUES(?,?,?,?)",
          round,
          d.user_id,
          target,
          i,
        ),
      ),
    );
  } else if (!id) {
    failure = "player_limit";
    kind = "add";
    const name = nickname(b.name);
    slotId = crypto.randomUUID();
    checks.push({
      sql: "SELECT 1 WHERE (SELECT count(*) FROM player_slots WHERE round_id=? AND deleted_at IS NULL)<8",
      args: [round],
    });
    writes.push(
      stmt(
        env,
        "INSERT INTO player_slots(slot_id,round_id,name,position) VALUES(?,?,?,(SELECT COALESCE(MAX(position),-1)+1 FROM player_slots WHERE round_id=?))",
        slotId,
        round,
        name,
        round,
      ),
    );
    after = { name, user_id: null };
  } else {
    old = await slot(env, round, id);
    const version = revision(b.version);
    if (version !== old.version) throw new ApiError("player_changed", 409);
    checks.push({
      sql: "SELECT 1 FROM player_slots WHERE round_id=? AND slot_id=? AND version=? AND deleted_at IS NULL",
      args: [round, id, version],
    });
    if (method === "DELETE") {
      kind = "delete";
      failure = "delete_changed";
      const info = await impact(env, round, id);
      if (!info.can_delete)
        throw new ApiError(
          info.player_count <= 1 ? "last_player" : "player_protected",
          409,
        );
      const rosterVersion = revision(b.roster_version),
        targetCount = revision(b.target_count);
      checks.push(
        {
          sql: "SELECT 1 FROM rounds WHERE round_id=? AND roster_version=?",
          args: [round, rosterVersion],
        },
        {
          sql: "SELECT 1 FROM player_slots p WHERE p.slot_id=? AND p.user_id IS NULL AND NOT EXISTS(SELECT 1 FROM scores WHERE slot_id=p.slot_id AND strokes IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM deliveries WHERE slot_id=p.slot_id) AND NOT EXISTS(SELECT 1 FROM receipts WHERE player_slot_id=p.slot_id)",
          args: [id],
        },
        {
          sql: "SELECT 1 WHERE (SELECT count(*) FROM input_targets WHERE slot_id=?)=?",
          args: [id, targetCount],
        },
        {
          sql: "SELECT 1 WHERE (SELECT count(*) FROM player_slots WHERE round_id=? AND deleted_at IS NULL)>1",
          args: [round],
        },
      );
      // Retain the slot and audit identity. No cascade can destroy historical score/receipt data.
      writes.push(
        stmt(
          env,
          "UPDATE input_target_lists SET version=version+1 WHERE round_id=? AND user_id IN (SELECT user_id FROM input_targets WHERE slot_id=?)",
          round,
          id,
        ),
        stmt(env, "DELETE FROM input_targets WHERE slot_id=?", id),
        stmt(
          env,
          "UPDATE player_slots SET deleted_at=?,version=version+1 WHERE slot_id=?",
          now(),
          id,
        ),
      );
      after = { deleted: true };
    } else if (b.action === "rename") {
      kind = "rename";
      if (old.user_id) throw new ApiError("linked_name_locked", 409);
      const name = nickname(b.name);
      writes.push(
        stmt(
          env,
          "UPDATE player_slots SET name=?,version=version+1 WHERE slot_id=?",
          name,
          id,
        ),
      );
      after = { name, user_id: null };
    } else if (b.action === "link") {
      kind = "link";
      failure = "player_link_changed";
      if (old.user_id) throw new ApiError("player_already_linked", 409);
      const code = normalizePersonalCode(b.code);
      if (!code) throw new ApiError("invalid_personal_code");
      const user = await stmt(
        env,
        "SELECT user_id,nickname FROM users WHERE personal_code=?",
        code,
      ).first<{ user_id: string; nickname: string }>();
      if (!user) throw new ApiError("user_not_found", 404);
      if (user.user_id !== b.confirmed_user_id)
        throw new ApiError("player_link_changed", 409);
      if (
        await stmt(
          env,
          "SELECT 1 FROM player_slots WHERE round_id=? AND user_id=? AND deleted_at IS NULL",
          round,
          user.user_id,
        ).first()
      )
        throw new ApiError("user_already_player", 409);
      checks.push({
        sql: "SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM player_slots WHERE round_id=? AND user_id=? AND deleted_at IS NULL)",
        args: [round, user.user_id],
      });
      writes.push(
        stmt(
          env,
          "UPDATE player_slots SET user_id=?,version=version+1 WHERE slot_id=?",
          user.user_id,
          id,
        ),
      );
      after = { name: old.name, user_id: user.user_id };
    } else if (b.action === "unlink") {
      kind = "unlink";
      if (!old.user_id) throw new ApiError("player_changed", 409);
      const name = nickname(b.name);
      writes.push(
        stmt(
          env,
          "UPDATE player_slots SET user_id=NULL,name=?,version=version+1 WHERE slot_id=?",
          name,
          id,
        ),
      );
      after = { name, user_id: null };
    } else throw new ApiError("invalid_request");
  }
  if (area === "players") {
    writes.push(
      stmt(
        env,
        "UPDATE rounds SET roster_version=roster_version+1,updated_at=? WHERE round_id=?",
        now(),
        round,
      ),
      stmt(
        env,
        "INSERT INTO player_audit(audit_id,round_id,slot_id,actor_id,kind,before_json,after_json,created_at) VALUES(?,?,?,?,?,?,?,?)",
        crypto.randomUUID(),
        round,
        slotId!,
        d.user_id,
        kind,
        old ? JSON.stringify(old) : null,
        JSON.stringify(after),
        now(),
      ),
    );
  }
  writes.push(
    stmt(
      env,
      "INSERT INTO player_mutations(user_id,mutation_id,round_id,request_hash,created_at) VALUES(?,?,?,?,?)",
      d.user_id,
      mutationId,
      round,
      requestHash,
      now(),
    ),
  );
  try {
    await atomic(env, d, checks, writes, failure);
  } catch (e) {
    if (await replay(env, d, mutationId, requestHash))
      return json(await result());
    if (!renameOnly && (await getRound(env, round)).status !== "active")
      throw new ApiError("round_ended", 409);
    throw e;
  }
  return json(await result(), method === "POST" ? 201 : 200);
}
