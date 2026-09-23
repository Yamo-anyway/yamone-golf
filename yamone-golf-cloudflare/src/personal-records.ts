import {
  ApiError,
  body,
  hash,
  json,
  now,
  type Device,
  type Env,
} from "./shared";
import { atomic, stmt, uid, revision } from "./round-store";
import { recordDetail } from "./records";
import {
  EDIT_WINDOW_MS,
  type PersonalScoreView,
  type PersonalScoreWrite,
  type Statistics,
} from "../../shared/personal-records";
import type { Score } from "../../shared/scores";

// One active receipt per user/round; counts use only the receipt's own slot.
const personal = `WITH personal AS (
 SELECT q.*,r.hole_count,r.ended_at,r.course_snapshot,json_extract(r.course_snapshot,'$.name') course_name,
 COALESCE(u.nickname,p.name) player_name,CASE WHEN p.user_id=q.user_id AND p.deleted_at IS NULL THEN 1 ELSE 0 END current_player,
 COUNT(s.strokes) holes_recorded,SUM(s.strokes) total_strokes,
 (SELECT SUM(par.value) FROM json_each(r.course_snapshot,'$.segments') seg JOIN json_each(seg.value,'$.pars') par) total_par
 FROM receipts q JOIN rounds r ON r.round_id=q.round_id
 JOIN player_slots p ON p.slot_id=q.player_slot_id AND p.round_id=q.round_id
 LEFT JOIN users u ON u.user_id=p.user_id
 LEFT JOIN scores s ON s.round_id=q.round_id AND s.slot_id=q.player_slot_id AND s.hole BETWEEN 1 AND r.hole_count
 WHERE q.user_id=? AND q.status='received' AND r.status='ended' GROUP BY q.receipt_id
)`;
const eligible = "current_player=1 AND hole_count=18 AND holes_recorded=18";
const eligibleHoles = `${personal}, eligible AS (SELECT * FROM personal WHERE ${eligible}), holes AS (
 SELECT s.strokes,CAST(json_extract(e.course_snapshot,'$.segments['||CAST((s.hole-1)/9 AS INTEGER)||'].pars['||((s.hole-1)%9)||']') AS INTEGER) par
 FROM eligible e JOIN scores s ON s.round_id=e.round_id AND s.slot_id=e.player_slot_id WHERE s.hole BETWEEN 1 AND 18 AND s.strokes IS NOT NULL
)`;
async function statistics(env: Env, d: Device): Promise<Statistics> {
  const [counts, totals, distribution, byPar, recent] = await env.DB.batch<any>(
    [
      stmt(
        env,
        `${personal} SELECT COUNT(*) received_rounds,COALESCE(SUM(${eligible}),0) eligible_rounds,
      COALESCE(SUM(current_player=0),0) unlinked,COALESCE(SUM(current_player=1 AND hole_count=9),0) nine_hole,
      COALESCE(SUM(current_player=1 AND hole_count=18 AND holes_recorded<>18),0) incomplete FROM personal`,
        d.user_id,
      ),
      stmt(
        env,
        `${personal} SELECT AVG(total_strokes) average_strokes,MIN(total_strokes) best_strokes,MAX(total_strokes) highest_strokes,AVG(total_strokes-total_par) average_to_par FROM personal WHERE ${eligible}`,
        d.user_id,
      ),
      stmt(
        env,
        `${eligibleHoles} SELECT COALESCE(SUM(strokes-par<=-2),0) eagle_or_better,COALESCE(SUM(strokes-par=-1),0) birdie,COALESCE(SUM(strokes=par),0) par,COALESCE(SUM(strokes-par=1),0) bogey,COALESCE(SUM(strokes-par>=2),0) double_or_worse FROM holes`,
        d.user_id,
      ),
      stmt(
        env,
        `${eligibleHoles} SELECT par,COUNT(*) holes,AVG(strokes) average_strokes FROM holes GROUP BY par ORDER BY par`,
        d.user_id,
      ),
      stmt(
        env,
        `${personal} SELECT receipt_id,round_id,course_name,ended_at,total_strokes,total_par FROM personal WHERE ${eligible} ORDER BY ended_at DESC,round_id DESC LIMIT 10`,
        d.user_id,
      ),
    ],
  );
  const { unlinked, nine_hole, incomplete, ...count } = counts.results[0];
  return {
    ...count,
    ...totals.results[0],
    excluded: { unlinked, nine_hole, incomplete },
    distribution: distribution.results[0],
    by_par: byPar.results,
    recent: recent.results,
  };
}
async function list(env: Env, d: Device, url: URL) {
  const q = (url.searchParams.get("q") ?? "").trim();
  const scope = url.searchParams.get("scope") ?? "all";
  if (
    q.length > 100 ||
    !["all", "statistics", "incomplete", "nine"].includes(scope)
  )
    throw new ApiError("invalid_request");
  const filters = ["1=1"],
    args: (number | string)[] = [d.user_id];
  if (q) {
    filters.push("course_name LIKE ? ESCAPE '\\'");
    args.push("%" + q.replace(/[\\%_]/g, "\\$&") + "%");
  }
  if (scope === "statistics") filters.push(eligible);
  if (scope === "incomplete") filters.push("holes_recorded<hole_count");
  if (scope === "nine") filters.push("hole_count=9");
  const before = url.searchParams.get("before");
  if (before) {
    const [time, id, extra] = before.split(":");
    const at = Number(time);
    if (extra !== undefined || !Number.isSafeInteger(at) || at < 0)
      throw new ApiError("invalid_request");
    filters.push("(received_at<? OR (received_at=? AND receipt_id<?))");
    args.push(at, at, uid(id));
  }
  const rows = (
    await stmt(
      env,
      `${personal} SELECT receipt_id,round_id,user_id,player_slot_id,delivery_id,status,received_at,deleted_at,course_name,hole_count,ended_at,player_name,holes_recorded,total_strokes,current_player FROM personal WHERE ${filters.join(" AND ")} ORDER BY received_at DESC,receipt_id DESC LIMIT 21`,
      ...args,
    ).all<any>()
  ).results;
  return json({
    items: rows.slice(0, 20),
    next_cursor:
      rows.length > 20
        ? rows[19].received_at + ":" + rows[19].receipt_id
        : null,
  });
}
export async function personalView(
  env: Env,
  d: Device,
  id: string,
): Promise<PersonalScoreView> {
  const detail = await recordDetail(env, d, id);
  if (!detail.sheet) throw new ApiError("record_deleted", 409);
  const s = detail.sheet,
    slot = detail.receipt.player_slot_id;
  return {
    receipt_id: id,
    round_id: s.round_id,
    user_id: d.user_id,
    player_slot_id: slot,
    slot_version: detail.slot_version,
    player_name: s.players.find((p) => p.slot_id === slot)?.name ?? "",
    hole_count: s.hole_count,
    course: s.course,
    scores: s.scores.filter((v) => v.slot_id === slot),
    edit: detail.edit,
  };
}
const score = (v: PersonalScoreView, hole: number): Score =>
  v.scores.find((s) => s.hole === hole) ?? {
    slot_id: v.player_slot_id,
    hole,
    strokes: null,
    version: 0,
  };
export async function personalRecordsRoute(
  request: Request,
  env: Env,
  d: Device,
): Promise<Response | null> {
  const url = new URL(request.url),
    path = url.pathname;
  if (path === "/api/statistics" && request.method === "GET")
    return json(await statistics(env, d));
  if (path === "/api/records" && request.method === "GET")
    return list(env, d, url);
  const match = path.match(/^\/api\/records\/([^/]+)\/scores$/);
  if (!match) return null;
  const id = uid(match[1]);
  const expectedUser = url.searchParams.get("user_id");
  if (expectedUser && expectedUser !== d.user_id)
    throw new ApiError("user_changed", 409);
  if (request.method === "GET") return json(await personalView(env, d, id));
  if (request.method !== "PUT") throw new ApiError("not_found", 404);
  const b = await body(request);
  if (b.user_id !== d.user_id) throw new ApiError("user_changed", 409);
  const w: PersonalScoreWrite = {
    user_id: d.user_id,
    mutation_id: uid(b.mutation_id),
    player_slot_id: uid(b.player_slot_id),
    slot_version: revision(b.slot_version),
    version: revision(b.version),
    hole: Number(b.hole),
    strokes: b.strokes as number | null,
  };
  if (
    !Number.isInteger(b.hole) ||
    w.hole < 1 ||
    w.hole > 18 ||
    (w.strokes !== null &&
      (!Number.isSafeInteger(w.strokes) || w.strokes < 1 || w.strokes > 999))
  )
    throw new ApiError("invalid_score");
  const fingerprint = await hash(
    JSON.stringify([
      "personal",
      id,
      w.player_slot_id,
      w.slot_version,
      w.hole,
      w.strokes,
      w.version,
    ]),
  );
  const replay = async () => {
    const old = await stmt(
      env,
      "SELECT request_hash FROM score_mutations WHERE user_id=? AND mutation_id=?",
      d.user_id,
      w.mutation_id,
    ).first<{ request_hash: string }>();
    if (old && old.request_hash !== fingerprint)
      throw new ApiError("request_reused", 409);
    return !!old;
  };
  for (let attempt = 0; attempt < 4; attempt++) {
    // A committed request remains acknowledged after the deadline/deletion/link change.
    if (await replay())
      return json({ mutation_id: w.mutation_id, replayed: true });
    const v = await personalView(env, d, id);
    if (!v.edit.allowed) throw new ApiError(v.edit.reason, 409);
    if (v.player_slot_id !== w.player_slot_id)
      throw new ApiError("record_edit_forbidden", 403);
    if (v.slot_version !== w.slot_version)
      throw new ApiError("player_link_changed", 409);
    if (w.hole > v.hole_count) throw new ApiError("invalid_score");
    const current = score(v, w.hole);
    if (current.version !== w.version && current.strokes !== w.strokes)
      return json({ error: "score_conflict", current, view: v }, 409);
    const at = now(),
      writes: D1PreparedStatement[] = [];
    if (current.strokes !== w.strokes)
      writes.push(
        stmt(
          env,
          `INSERT INTO scores(round_id,slot_id,hole,strokes,version,updated_by,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(slot_id,hole) DO UPDATE SET strokes=excluded.strokes,version=excluded.version,updated_by=excluded.updated_by,updated_at=excluded.updated_at`,
          v.round_id,
          w.player_slot_id,
          w.hole,
          w.strokes,
          current.version + 1,
          d.user_id,
          at,
        ),
        stmt(
          env,
          "INSERT INTO score_audit(audit_id,round_id,slot_id,hole,actor_id,before_strokes,after_strokes,version,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
          crypto.randomUUID(),
          v.round_id,
          w.player_slot_id,
          w.hole,
          d.user_id,
          current.strokes,
          w.strokes,
          current.version + 1,
          at,
        ),
        // End time and inactivity anchor remain fixed; Peoria snapshots are never changed here.
        stmt(
          env,
          "UPDATE rounds SET record_version=record_version+1 WHERE round_id=?",
          v.round_id,
        ),
      );
    writes.push(
      stmt(
        env,
        "INSERT INTO score_mutations(user_id,mutation_id,round_id,request_hash,created_at) VALUES(?,?,?,?,?)",
        d.user_id,
        w.mutation_id,
        v.round_id,
        fingerprint,
        at,
      ),
    );
    try {
      await atomic(
        env,
        d,
        [
          {
            sql: `SELECT 1 FROM receipts q JOIN rounds r ON r.round_id=q.round_id JOIN player_slots p ON p.round_id=q.round_id AND p.slot_id=q.player_slot_id WHERE q.receipt_id=? AND q.user_id=? AND q.status='received' AND p.user_id=q.user_id AND p.slot_id=? AND p.version=? AND p.deleted_at IS NULL AND r.status='ended' AND r.hole_count>=? AND r.ended_at > CAST(unixepoch('subsec')*1000 AS INTEGER)-${EDIT_WINDOW_MS}`,
            args: [id, d.user_id, w.player_slot_id, w.slot_version, w.hole],
          },
          {
            sql: "SELECT 1 WHERE COALESCE((SELECT version FROM scores WHERE slot_id=? AND hole=?),0)=?",
            args: [w.player_slot_id, w.hole, current.version],
          },
        ],
        writes,
        "personal_retry",
      );
      return json({ mutation_id: w.mutation_id, replayed: false });
    } catch (e) {
      if (!(e instanceof ApiError) || e.code !== "personal_retry") throw e;
    }
  }
  if (await replay())
    return json({ mutation_id: w.mutation_id, replayed: true });
  throw new ApiError("state_changed", 409);
}
