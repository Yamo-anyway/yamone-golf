export type Score = {
  slot_id: string;
  hole: number;
  strokes: number | null;
  version: number;
};
export type ScorePlayer = { slot_id: string; name: string; position: number };
export type ScoreSheet = {
  round_id: string;
  status: "active" | "ended";
  hole_count: number;
  course: { name: string; segments: { name: string; pars: number[] }[] };
  roster_version: number;
  target_version: number;
  slot_ids: string[];
  players: ScorePlayer[];
  scores: Score[];
};
export type ScoreChange = {
  slot_id: string;
  strokes: number | null;
  version: number;
};
export type ScoreWrite = {
  mutation_id: string;
  hole: number;
  roster_version: number;
  target_version: number;
  entries: ScoreChange[];
};
export type ScoreConflict = ScoreChange & { proposed: number | null };
export function scoreAt(sheet: ScoreSheet, slot: string, hole: number): Score {
  return (
    sheet.scores.find((s) => s.slot_id === slot && s.hole === hole) ?? {
      slot_id: slot,
      hole,
      strokes: null,
      version: 0,
    }
  );
}
export function ranking(sheet: ScoreSheet, hole?: number) {
  const rows = sheet.players
    .map((p) => {
      const scores = sheet.scores.filter(
        (s) =>
          s.slot_id === p.slot_id &&
          s.strokes !== null &&
          (hole === undefined || s.hole === hole),
      );
      return {
        ...p,
        count: scores.length,
        total: scores.length
          ? scores.reduce((n, s) => n + s.strokes!, 0)
          : null,
        rank: null as number | null,
      };
    })
    .sort(
      (a, b) =>
        (a.total ?? Infinity) - (b.total ?? Infinity) ||
        a.position - b.position,
    );
  let rank = 0;
  return rows.map((p, i) => {
    if (p.total !== null && (i === 0 || p.total !== rows[i - 1].total))
      rank = i + 1;
    return { ...p, rank: p.total === null ? null : rank };
  });
}
export function symbolFor(strokes: number | null, par: number) {
  if (strokes === null) return "empty";
  return strokes < par
    ? "birdie"
    : strokes === par
      ? "par"
      : strokes === par + 1
        ? "bogey"
        : "double";
}
export function initialHole(sheet: ScoreSheet, saved: number | null) {
  if (
    saved !== null &&
    Number.isInteger(saved) &&
    saved >= 1 &&
    saved <= sheet.hole_count
  )
    return saved;
  for (let h = 1; h <= sheet.hole_count; h++)
    if (sheet.slot_ids.some((id) => scoreAt(sheet, id, h).strokes === null))
      return h;
  return 1;
}
