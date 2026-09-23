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
export type PeoriaHistory = {
  round_id: string;
  record_version: number;
  latest_run_id: string | null;
  runs: PeoriaRun[];
  // Stage 9 foundation: no timing or calculation permission is assumed.
  calculation: { available: false; reason: "policy_pending" };
};
