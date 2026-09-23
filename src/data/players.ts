import { request } from "./api";
export type Player = {
  slot_id: string;
  user_id: string | null;
  name: string;
  temporary_name?: string;
  position: number;
  version: number;
  personal_code: string | null;
  score_count: number;
  delivery_count: number;
  receipt_count: number;
};
export type Roster = {
  status: "active" | "ended";
  roster_version: number;
  players: Player[];
};
export type TargetPlayer = Pick<
  Player,
  "slot_id" | "user_id" | "name" | "position" | "personal_code"
>;
export type Targets = {
  status: "active" | "ended";
  version: number;
  roster_version: number;
  customized: boolean;
  players: TargetPlayer[];
  slot_ids: string[];
};
export type PlayerLookup = {
  user: { user_id: string; nickname: string; personal_code: string };
  linked_slot_id: string | null;
};
export type DeleteImpact = {
  linked: number;
  score_count: number;
  delivery_count: number;
  receipt_count: number;
  target_count: number;
  player_count: number;
  version: number;
  roster_version: number;
  can_delete: boolean;
};
export type SlotChange =
  | { action: "rename" | "unlink"; name: string }
  | { action: "link"; code: string; confirmed_user_id: string };
const base = (round: string) => "/api/rounds/" + round;
export const players = {
  roster: (round: string) => request<Roster>(base(round) + "/players"),
  lookup: (round: string, code: string) =>
    request<PlayerLookup>(base(round) + "/player-lookup", "POST", { code }),
  add: (round: string, name: string, mutation_id: string) =>
    request<Roster>(base(round) + "/players", "POST", { name, mutation_id }),
  change: (
    round: string,
    slot: string,
    version: number,
    change: SlotChange,
    mutation_id: string,
  ) =>
    request<Roster>(base(round) + "/players/" + slot, "PATCH", {
      version,
      ...change,
      mutation_id,
    }),
  impact: (round: string, slot: string) =>
    request<DeleteImpact>(base(round) + "/players/" + slot + "/delete-impact"),
  remove: (
    round: string,
    slot: string,
    impact: DeleteImpact,
    mutation_id: string,
  ) =>
    request<Roster>(base(round) + "/players/" + slot, "DELETE", {
      version: impact.version,
      roster_version: impact.roster_version,
      target_count: impact.target_count,
      mutation_id,
    }),
  targets: (round: string) => request<Targets>(base(round) + "/input-targets"),
  saveTargets: (
    round: string,
    data: Pick<Targets, "version" | "roster_version" | "slot_ids">,
    mutation_id: string,
  ) =>
    request<Targets>(base(round) + "/input-targets", "PATCH", {
      ...data,
      mutation_id,
    }),
};
