import type { Score, ScoreSheet } from "./scores";
export const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
export type EditAccess = {
  allowed: boolean;
  reason: "available" | "record_deleted" | "record_unlinked" | "record_locked";
  deadline: number;
  server_time: number;
};
export function editAccess(
  ended: number,
  received: boolean,
  linked: boolean,
  at: number,
): EditAccess {
  const reason = !received
    ? "record_deleted"
    : !linked
      ? "record_unlinked"
      : at >= ended + EDIT_WINDOW_MS
        ? "record_locked"
        : "available";
  return {
    allowed: reason === "available",
    reason,
    deadline: ended + EDIT_WINDOW_MS,
    server_time: at,
  };
}
export type PersonalScoreView = {
  receipt_id: string;
  round_id: string;
  user_id: string;
  player_slot_id: string;
  slot_version: number;
  player_name: string;
  hole_count: number;
  course: ScoreSheet["course"];
  scores: Score[];
  edit: EditAccess;
};
export type PersonalScoreWrite = {
  user_id: string;
  mutation_id: string;
  player_slot_id: string;
  slot_version: number;
  hole: number;
  strokes: number | null;
  version: number;
};
export type PersonalConflict = { current: Score; view: PersonalScoreView };
export type RecordFilter = "all" | "statistics" | "incomplete" | "nine";
export type Statistics = {
  received_rounds: number;
  eligible_rounds: number;
  excluded: { unlinked: number; nine_hole: number; incomplete: number };
  average_strokes: number | null;
  best_strokes: number | null;
  highest_strokes: number | null;
  average_to_par: number | null;
  distribution: {
    eagle_or_better: number;
    birdie: number;
    par: number;
    bogey: number;
    double_or_worse: number;
  };
  by_par: { par: number; holes: number; average_strokes: number }[];
  recent: {
    receipt_id: string;
    round_id: string;
    course_name: string;
    ended_at: number;
    total_strokes: number;
    total_par: number;
  }[];
};
