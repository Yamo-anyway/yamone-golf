import {
  ApiError,
  body,
  hash,
  json,
  now,
  type Env,
  type Device,
} from "./shared";
import {
  atomic,
  getRound,
  member,
  stmt,
  uid,
  revision,
  liveCheck,
  type Check,
} from "./round-store";
import {
  scoreAt,
  type ScoreSheet,
  type ScoreChange,
  type ScoreConflict,
} from "../../shared/scores";
export async function sheet(
  env: Env,
  round: string,
  d: Device,
): Promise<ScoreSheet> {
  const r = await env.DB.batch<any>([
    stmt(
      env,
      "SELECT round_id,status,hole_count,course_snapshot,roster_version FROM rounds WHERE round_id=?",
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
      "SELECT p.slot_id,COALESCE(u.nickname,p.name) name,p.position FROM player_slots p LEFT JOIN users u ON u.user_id=p.user_id WHERE p.round_id=? AND p.deleted_at IS NULL ORDER BY p.position",
      round,
    ),
    stmt(
      env,
      "SELECT s.slot_id,s.hole,s.strokes,s.version FROM scores s JOIN player_slots p ON p.slot_id=s.slot_id WHERE s.round_id=? AND p.deleted_at IS NULL",
      round,
    ),
  ]);
  const { course_snapshot, ...roundData } = r[0].results[0];
  const list = r[1].results[0],
    players = r[3].results;
  return {
    ...roundData,
    course: JSON.parse(course_snapshot),
    target_version: list?.version ?? 0,
    slot_ids: (list ? r[2].results : players).map((p: any) => p.slot_id),
    players,
    scores: r[4].results,
  };
}
export async function scoresRoute(
  request: Request,
  env: Env,
  d: Device,
): Promise<Response | null> {
  const m = new URL(request.url).pathname.match(
    /^\/api\/rounds\/([^/]+)\/scores$/,
  );
  if (!m) return null;
  const round = uid(m[1]);
  await getRound(env, round);
  await member(env, d, round);
  if (request.method === "GET") return json(await sheet(env, round, d));
  if (request.method !== "PUT") throw new ApiError("not_found", 404);
  const b = await body(request),
    id = uid(b.mutation_id),
    hole = Number(b.hole);
  if (
    !Number.isInteger(b.hole) ||
    hole < 1 ||
    hole > 18 ||
    !Array.isArray(b.entries) ||
    b.entries.length < 1 ||
    b.entries.length > 8
  )
    throw new ApiError("invalid_score");
  const rosterVersion = revision(b.roster_version),
    targetVersion = revision(b.target_version);
  const entries: ScoreChange[] = b.entries
    .map((v: unknown) => {
      if (!v || typeof v !== "object") throw new ApiError("invalid_score");
      const e = v as Record<string, unknown>;
      if (
        e.strokes !== null &&
        (!Number.isSafeInteger(e.strokes) ||
          Number(e.strokes) < 1 ||
          Number(e.strokes) > 999)
      )
        throw new ApiError("invalid_score");
      return {
        slot_id: uid(e.slot_id),
        version: revision(e.version),
        strokes: e.strokes as number | null,
      };
    })
    .sort((a, b) => a.slot_id.localeCompare(b.slot_id));
  if (new Set(entries.map((e) => e.slot_id)).size !== entries.length)
    throw new ApiError("invalid_score");
  const fingerprint = await hash(
    JSON.stringify({ round, hole, rosterVersion, targetVersion, entries }),
  );
  const replay = async () => {
    const old = await stmt(
      env,
      "SELECT request_hash FROM score_mutations WHERE user_id=? AND mutation_id=?",
      d.user_id,
      id,
    ).first<{ request_hash: string }>();
    if (!old) return null;
    if (old.request_hash !== fingerprint)
      throw new ApiError("request_reused", 409);
    return json({ sheet: await sheet(env, round, d), replayed: true });
  };
  for (let attempt = 0; attempt < 4; attempt++) {
    const old = await replay();
    if (old) return old;
    const current = await sheet(env, round, d);
    if (current.status !== "active") throw new ApiError("round_ended", 409);
    if (hole > current.hole_count) throw new ApiError("invalid_score");
    if (
      current.roster_version !== rosterVersion ||
      current.target_version !== targetVersion ||
      current.slot_ids.length !== entries.length ||
      entries.some((e) => !current.slot_ids.includes(e.slot_id))
    )
      throw new ApiError("targets_changed", 409);
    const conflicts: ScoreConflict[] = entries.flatMap((e) => {
      const s = scoreAt(current, e.slot_id, hole);
      return s.version !== e.version && s.strokes !== e.strokes
        ? [
            {
              slot_id: e.slot_id,
              strokes: s.strokes,
              version: s.version,
              proposed: e.strokes,
            },
          ]
        : [];
    });
    if (conflicts.length)
      return json({ error: "score_conflict", conflicts, sheet: current }, 409);
    const checks: Check[] = [
      liveCheck(round),
      {
        sql: "SELECT 1 FROM round_participants WHERE round_id=? AND user_id=?",
        args: [round, d.user_id],
      },
      {
        sql: "SELECT 1 FROM rounds WHERE round_id=? AND roster_version=? AND hole_count>=?",
        args: [round, rosterVersion, hole],
      },
      {
        sql: "SELECT 1 WHERE COALESCE((SELECT version FROM input_target_lists WHERE round_id=? AND user_id=?),0)=?",
        args: [round, d.user_id, targetVersion],
      },
    ];
    const writes: D1PreparedStatement[] = [],
      at = now();
    for (const e of entries) {
      const s = scoreAt(current, e.slot_id, hole);
      checks.push(
        {
          sql: "SELECT 1 FROM player_slots WHERE round_id=? AND slot_id=? AND deleted_at IS NULL",
          args: [round, e.slot_id],
        },
        {
          sql: "SELECT 1 WHERE COALESCE((SELECT version FROM scores WHERE slot_id=? AND hole=?),0)=?",
          args: [e.slot_id, hole, s.version],
        },
      );
      if (s.strokes === e.strokes) continue;
      writes.push(
        stmt(
          env,
          `INSERT INTO scores(round_id,slot_id,hole,strokes,version,updated_by,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(slot_id,hole) DO UPDATE SET strokes=excluded.strokes,version=excluded.version,updated_by=excluded.updated_by,updated_at=excluded.updated_at`,
          round,
          e.slot_id,
          hole,
          e.strokes,
          s.version + 1,
          d.user_id,
          at,
        ),
        stmt(
          env,
          "INSERT INTO score_audit(audit_id,round_id,slot_id,hole,actor_id,before_strokes,after_strokes,version,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
          crypto.randomUUID(),
          round,
          e.slot_id,
          hole,
          d.user_id,
          s.strokes,
          e.strokes,
          s.version + 1,
          at,
        ),
      );
    }
    if (writes.length)
      writes.push(
        stmt(env, "UPDATE rounds SET updated_at=? WHERE round_id=?", at, round),
      );
    writes.push(
      stmt(
        env,
        "INSERT INTO score_mutations(user_id,mutation_id,round_id,request_hash,created_at) VALUES(?,?,?,?,?)",
        d.user_id,
        id,
        round,
        fingerprint,
        at,
      ),
    );
    try {
      await atomic(env, d, checks, writes, "score_retry");
      return json({ sheet: await sheet(env, round, d), replayed: false });
    } catch (e) {
      if (!(e instanceof ApiError) || e.code !== "score_retry") throw e;
    }
  }
  const old = await replay();
  if (old) return old;
  throw new ApiError("state_changed", 409);
}
