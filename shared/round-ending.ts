export type EndRequest = {
  user_id: string;
  mutation_id: string;
  record_version: number;
};
export type EndView = {
  round_id: string;
  status: "active" | "ended";
  hole_count: number;
  record_version: number;
  permission_version: number;
  updated_at: number;
  ended_at: number | null;
  reason: "manual" | "inactivity" | null;
  ended_by: string | null;
  can_end: boolean;
  is_creator: boolean;
  players: {
    slot_id: string;
    name: string;
    holes_recorded: number;
    total_strokes: number | null;
    complete: boolean;
  }[];
  participants: {
    user_id: string;
    nickname: string;
    personal_code: string;
    can_end: number;
  }[];
};
