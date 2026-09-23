import {
  PEORIA_WINDOW_MS,
  type PeoriaHistory,
  type PeoriaRun,
} from "../../shared/peoria";
import {
  type Device,
  type Env,
  ApiError,
  body,
  hash,
  json,
  now,
} from "./shared";
import { atomic, getRound, revision, stmt, uid } from "./round-store";
import {
  peoriaPublicColumns,
  publicPeoriaRun,
  type HistoryRow,
} from "./peoria-history";
import { calculatePeoria, hiddenCandidates } from "./peoria-engine";

export async function peoriaView(env: Env, d: Device, id: string) {
  await getRound(env, id);
  const access = `r.round_id=? AND (r.creator_id=? OR
    EXISTS(SELECT 1 FROM round_participants m WHERE m.round_id=r.round_id AND m.user_id=?) OR
    EXISTS(SELECT 1 FROM receipts q WHERE q.round_id=r.round_id AND q.user_id=? AND q.status='received'))`;
  const args = [id, d.user_id, d.user_id, d.user_id];
  const data = await env.DB.batch<any>([
    stmt(
      env,
      `SELECT r.*,u.nickname actor_name,
      (r.creator_id=? OR EXISTS(SELECT 1 FROM round_participants m WHERE m.round_id=r.round_id AND m.user_id=? AND m.can_end=1)) can_calculate
      FROM rounds r JOIN users u ON u.user_id=? WHERE ${access}`,
      d.user_id,
      d.user_id,
      d.user_id,
      ...args,
    ),
    stmt(
      env,
      `SELECT p.slot_id,p.user_id,COALESCE(u.nickname,p.name) name FROM player_slots p LEFT JOIN users u ON u.user_id=p.user_id JOIN rounds r ON r.round_id=p.round_id WHERE ${access} AND p.deleted_at IS NULL ORDER BY p.position`,
      ...args,
    ),
    stmt(
      env,
      `SELECT s.slot_id,s.hole,s.strokes FROM scores s JOIN rounds r ON r.round_id=s.round_id WHERE ${access} AND s.hole<=r.hole_count`,
      ...args,
    ),
    stmt(
      env,
      `SELECT ${peoriaPublicColumns} FROM peoria_runs p JOIN rounds r ON r.round_id=p.round_id WHERE ${access} ORDER BY p.ordinal DESC`,
      ...args,
    ),
  ]);
  const r = data[0].results[0];
  if (!r) throw new ApiError("forbidden", 403);
  if (r.status !== "ended") throw new ApiError("round_not_ended", 409);
  const course = JSON.parse(r.course_snapshot);
  const snapshot: PeoriaRun["snapshot"] = {
    course_name: course.name,
    pars: course.segments.flatMap((s: { pars: number[] }) => s.pars),
    players: data[1].results.map((p: any) => ({
      ...p,
      scores: Array.from(
        { length: r.hole_count },
        (_, i) =>
          data[2].results.find(
            (s: any) => s.slot_id === p.slot_id && s.hole === i + 1,
          )?.strokes ?? null,
      ),
    })),
  };
  const runs = (data[3].results as HistoryRow[]).map(publicPeoriaRun);
  const complete = snapshot.players.map((p) => ({
    slot_id: p.slot_id,
    name: p.name,
    holes_recorded: p.scores.filter((s) => s !== null).length,
  }));
  const targets = complete.filter((p) => p.holes_recorded === 18),
    excluded = complete.filter((p) => p.holes_recorded !== 18);
  const time = now(),
    deadline = r.ended_at + PEORIA_WINDOW_MS;
  const reason = !r.can_calculate
    ? "peoria_forbidden"
    : time >= deadline
      ? "peoria_expired"
      : runs.length >= 3
        ? "peoria_limit"
        : r.hole_count !== 18 || !hiddenCandidates(snapshot.pars)
          ? "peoria_course_unsupported"
          : !targets.length
            ? "peoria_no_players"
            : "available";
  const token = await hash(
    JSON.stringify([
      id,
      r.record_version,
      r.permission_version,
      r.ended_at,
      r.actor_name,
      snapshot,
      runs.map((p) => p.run_id),
    ]),
  );
  const view: PeoriaHistory = {
    round_id: id,
    record_version: r.record_version,
    latest_run_id: runs[0]?.run_id ?? null,
    runs,
    calculation: {
      available: reason === "available",
      reason,
      deadline,
      server_time: time,
      confirmation_token: token,
      targets,
      excluded,
    },
  };
  return { view, snapshot, round: r };
}
async function replay(
  env: Env,
  d: Device,
  request: string,
  fingerprint: string,
) {
  const old = await stmt(
    env,
    "SELECT run_id,request_hash FROM peoria_runs WHERE actor_id=? AND request_id=?",
    d.user_id,
    request,
  ).first<{ run_id: string; request_hash: string }>();
  if (old && old.request_hash !== fingerprint)
    throw new ApiError("request_reused", 409);
  return old?.run_id;
}
export async function peoriaRoute(
  request: Request,
  env: Env,
  d: Device,
): Promise<Response | null> {
  const match = new URL(request.url).pathname.match(
    /^\/api\/rounds\/([^/]+)\/peoria$/,
  );
  if (!match) return null;
  const id = uid(match[1]);
  if (request.method === "GET")
    return json((await peoriaView(env, d, id)).view);
  if (request.method !== "POST") throw new ApiError("not_found", 404);
  const b = await body(request);
  if (b.user_id !== d.user_id) throw new ApiError("user_changed", 409);
  const requestId = uid(b.request_id),
    version = revision(b.record_version),
    count = revision(b.expected_runs);
  if (
    count > 2 ||
    typeof b.confirmation_token !== "string" ||
    !/^[a-f0-9]{64}$/.test(b.confirmation_token) ||
    typeof b.exclude_incomplete !== "boolean" ||
    typeof b.confirm_recalculation !== "boolean" ||
    Object.keys(b).some(
      (k) =>
        ![
          "user_id",
          "request_id",
          "record_version",
          "expected_runs",
          "confirmation_token",
          "exclude_incomplete",
          "confirm_recalculation",
        ].includes(k),
    )
  )
    throw new ApiError("invalid_request");
  const fingerprint = await hash(
    JSON.stringify([
      id,
      version,
      count,
      b.confirmation_token,
      b.exclude_incomplete,
      b.confirm_recalculation,
    ]),
  );
  const done = await replay(env, d, requestId, fingerprint);
  if (done)
    return json({ request_id: requestId, run_id: done, replayed: true });
  const { view, snapshot, round } = await peoriaView(env, d, id);
  const c = view.calculation;
  if (!c.available)
    throw new ApiError(c.reason, c.reason === "peoria_forbidden" ? 403 : 409);
  if (
    version !== view.record_version ||
    count !== view.runs.length ||
    b.confirmation_token !== c.confirmation_token
  )
    throw new ApiError("peoria_changed", 409);
  if (c.excluded.length && !b.exclude_incomplete)
    throw new ApiError("peoria_exclusion_required", 409);
  if (count && !b.confirm_recalculation)
    throw new ApiError("peoria_recalculation_required", 409);
  const computed = calculatePeoria(
    snapshot.pars,
    snapshot.players.filter((p) =>
      c.targets.some((t) => t.slot_id === p.slot_id),
    ),
  );
  const runId = crypto.randomUUID();
  try {
    await atomic(
      env,
      d,
      [
        {
          sql: `SELECT 1 FROM rounds r WHERE r.round_id=? AND r.status='ended' AND r.hole_count=18 AND r.ended_at=? AND r.ended_at > CAST(unixepoch('subsec')*1000 AS INTEGER)-? AND r.record_version=? AND r.permission_version=? AND (r.creator_id=? OR EXISTS(SELECT 1 FROM round_participants m WHERE m.round_id=r.round_id AND m.user_id=? AND m.can_end=1))`,
          args: [
            id,
            round.ended_at,
            PEORIA_WINDOW_MS,
            version,
            round.permission_version,
            d.user_id,
            d.user_id,
          ],
        },
        {
          sql: "SELECT 1 WHERE (SELECT COUNT(*) FROM peoria_runs WHERE round_id=?)=?",
          args: [id, count],
        },
        {
          sql: "SELECT 1 FROM users WHERE user_id=? AND nickname=?",
          args: [d.user_id, round.actor_name],
        },
        ...snapshot.players.map((p) => ({
          sql: "SELECT 1 FROM player_slots p LEFT JOIN users u ON u.user_id=p.user_id WHERE p.slot_id=? AND p.round_id=? AND p.user_id IS ? AND p.deleted_at IS NULL AND COALESCE(u.nickname,p.name)=?",
          args: [p.slot_id, id, p.user_id, p.name],
        })),
      ],
      [
        stmt(
          env,
          `INSERT INTO peoria_runs(run_id,round_id,ordinal,calculated_at,actor_id,actor_name,source_record_version,algorithm_version,snapshot_json,target_slots_json,excluded_slots_json,results_json,hidden_holes_json,request_id,request_hash)
        VALUES(?,?,?,CAST(unixepoch('subsec')*1000 AS INTEGER),?,?,?,?,?,?,?,?,?,?,?)`,
          runId,
          id,
          count + 1,
          d.user_id,
          round.actor_name,
          version,
          computed.algorithm_version,
          JSON.stringify(snapshot),
          JSON.stringify(c.targets.map((p) => p.slot_id)),
          JSON.stringify(c.excluded.map((p) => p.slot_id)),
          JSON.stringify(computed.results),
          JSON.stringify(computed.hidden_holes),
          requestId,
          fingerprint,
        ),
      ],
      "peoria_changed",
    );
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) throw e;
    const replayed = await replay(env, d, requestId, fingerprint);
    if (replayed)
      return json({ request_id: requestId, run_id: replayed, replayed: true });
    if (e instanceof ApiError && e.code === "peoria_changed") {
      const latest = (await peoriaView(env, d, id)).view.calculation;
      if (!latest.available)
        throw new ApiError(
          latest.reason,
          latest.reason === "peoria_forbidden" ? 403 : 409,
        );
    }
    throw e;
  }
  return json({ request_id: requestId, run_id: runId, replayed: false }, 201);
}
