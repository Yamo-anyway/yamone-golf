import type { PeoriaHistory, PeoriaRun } from "../../shared/peoria";
import { ApiError, json, type Device, type Env } from "./shared";
import { getRound, stmt, uid } from "./round-store";

// Never SELECT *: private draw data must not leave D1 on a history read.
export const peoriaPublicColumns = `p.run_id,p.round_id,p.ordinal,p.calculated_at,
  p.actor_id,p.actor_name,p.source_record_version,p.algorithm_version,
  p.snapshot_json,p.target_slots_json,p.excluded_slots_json,p.results_json`;
type HistoryRow = Omit<
  PeoriaRun,
  "snapshot" | "target_slot_ids" | "excluded_slot_ids" | "results"
> & {
  snapshot_json: string;
  target_slots_json: string;
  excluded_slots_json: string;
  results_json: string;
};
function invalid(): never {
  throw new ApiError("peoria_history_invalid", 500);
}
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return invalid();
  return v as Record<string, unknown>;
}
function str(v: unknown): string {
  return typeof v === "string" ? v : invalid();
}
function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : invalid();
}
function integer(
  v: unknown,
  min: number,
  max = Number.MAX_SAFE_INTEGER,
): number {
  const n = num(v);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : invalid();
}
function list(v: unknown): unknown[] {
  return Array.isArray(v) ? v : invalid();
}
function parse(v: string): unknown {
  try {
    return JSON.parse(v);
  } catch {
    return invalid();
  }
}
export function publicPeoriaRun(row: HistoryRow): PeoriaRun {
  const s = object(parse(row.snapshot_json));
  // Explicit field projection also strips unexpected keys inside stored JSON.
  const snapshot = {
    course_name: str(s.course_name),
    pars: list(s.pars).map((v) => integer(v, 3, 7)),
    players: list(s.players).map((v) => {
      const p = object(v);
      const scores = list(p.scores).map((v) =>
        v === null ? null : integer(v, 1, 999),
      );
      if (scores.length !== 18) return invalid();
      return {
        slot_id: str(p.slot_id),
        user_id: p.user_id === null ? null : str(p.user_id),
        name: str(p.name),
        scores,
      };
    }),
  };
  const targets = list(parse(row.target_slots_json)).map(str);
  const excluded = list(parse(row.excluded_slots_json)).map(str);
  const results = list(parse(row.results_json)).map((v) => {
    const r = object(v);
    return {
      slot_id: str(r.slot_id),
      gross: integer(r.gross, 18, 17982),
      handicap: num(r.handicap),
      net: num(r.net),
      rank: integer(r.rank, 1, targets.length),
    };
  });
  const ids = snapshot.players.map((p) => p.slot_id);
  const assigned = [...targets, ...excluded];
  if (
    snapshot.pars.length !== 18 ||
    !targets.length ||
    new Set(ids).size !== ids.length ||
    new Set(assigned).size !== assigned.length ||
    assigned.length !== ids.length ||
    assigned.some((id) => !ids.includes(id)) ||
    results.length !== targets.length ||
    new Set(results.map((r) => r.slot_id)).size !== targets.length ||
    results.some((r) => !targets.includes(r.slot_id))
  )
    return invalid();
  for (const p of snapshot.players) {
    const complete = p.scores.every((v) => v !== null);
    if (complete !== targets.includes(p.slot_id)) return invalid();
    const r = results.find((r) => r.slot_id === p.slot_id);
    if (r && r.gross !== p.scores.reduce<number>((a, b) => a + (b ?? 0), 0))
      return invalid();
  }
  return {
    run_id: str(row.run_id),
    round_id: str(row.round_id),
    ordinal: integer(row.ordinal, 1, 3),
    calculated_at: integer(row.calculated_at, 0),
    actor_id: str(row.actor_id),
    actor_name: str(row.actor_name),
    source_record_version: integer(row.source_record_version, 0),
    algorithm_version: str(row.algorithm_version),
    snapshot,
    target_slot_ids: targets,
    excluded_slot_ids: excluded,
    results,
  };
}
export async function peoriaHistoryRoute(
  request: Request,
  env: Env,
  d: Device,
): Promise<Response | null> {
  const match = new URL(request.url).pathname.match(
    /^\/api\/rounds\/([^/]+)\/peoria$/,
  );
  if (!match || request.method !== "GET") return null;
  const id = uid(match[1]);
  await getRound(env, id); // Apply the existing server inactivity rule before reading.
  const access = `r.round_id=? AND (
    EXISTS(SELECT 1 FROM round_participants m WHERE m.round_id=r.round_id AND m.user_id=?) OR
    EXISTS(SELECT 1 FROM receipts q WHERE q.round_id=r.round_id AND q.user_id=? AND q.status='received'))`;
  const [rounds, history] = await env.DB.batch([
    stmt(
      env,
      `SELECT r.status,r.record_version FROM rounds r WHERE ${access}`,
      id,
      d.user_id,
      d.user_id,
    ),
    stmt(
      env,
      `SELECT ${peoriaPublicColumns} FROM peoria_runs p JOIN rounds r ON r.round_id=p.round_id WHERE ${access} AND r.status='ended' ORDER BY p.ordinal DESC`,
      id,
      d.user_id,
      d.user_id,
    ),
  ]);
  const r = rounds.results[0] as
    { status: string; record_version: number } | undefined;
  if (!r) throw new ApiError("forbidden", 403);
  if (r.status !== "ended") throw new ApiError("round_not_ended", 409);
  const runs = (history.results as HistoryRow[]).map(publicPeoriaRun);
  const result: PeoriaHistory = {
    round_id: id,
    record_version: r.record_version,
    latest_run_id: runs[0]?.run_id ?? null,
    runs,
    calculation: { available: false, reason: "policy_pending" },
  };
  return json(result);
}
