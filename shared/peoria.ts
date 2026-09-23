// Public history contract. Hidden holes and randomization data stay on the server.
export type PeoriaPlayerSnapshot = {
  slot_id: string;
  user_id: string | null;
  name: string;
  scores: (number | null)[];
};
export type PeoriaResult = {
  slot_id: string;
  gross: number;
  handicap: number;
  net: number;
  rank: number;
};
export type PeoriaRun = {
  run_id: string;
  round_id: string;
  ordinal: number;
  calculated_at: number;
  actor_id: string;
  actor_name: string;
  source_record_version: number;
  algorithm_version: string;
  snapshot: {
    course_name: string;
    pars: number[];
    players: PeoriaPlayerSnapshot[];
  };
  target_slot_ids: string[];
  excluded_slot_ids: string[];
  results: PeoriaResult[];
};
export const PEORIA_WINDOW_MS = 3 * 60 * 60 * 1000;
export type PeoriaReason =
  | "available"
  | "peoria_forbidden"
  | "peoria_expired"
  | "peoria_limit"
  | "peoria_no_players"
  | "peoria_course_unsupported";
export type PeoriaHistory = {
  round_id: string;
  record_version: number;
  latest_run_id: string | null;
  runs: PeoriaRun[];
  calculation: {
    available: boolean;
    reason: PeoriaReason;
    deadline: number;
    server_time: number;
    confirmation_token: string;
    targets: { slot_id: string; name: string; holes_recorded: number }[];
    excluded: { slot_id: string; name: string; holes_recorded: number }[];
  };
};
export type PeoriaWrite = {
  user_id: string;
  request_id: string;
  record_version: number;
  expected_runs: number;
  confirmation_token: string;
  exclude_incomplete: boolean;
  confirm_recalculation: boolean;
};
export type PeoriaAck = {
  request_id: string;
  run_id: string;
  replayed: boolean;
};
