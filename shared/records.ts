import type { ScoreSheet } from "./scores";
import type { EditAccess } from "./personal-records";
export type Delivery = {
  delivery_id: string;
  round_id: string;
  slot_id: string;
  sender_id: string;
  recipient_id: string;
  status: "pending" | "received" | "cancelled";
  created_at: number;
  updated_at: number | null;
  sender_name: string;
  recipient_name: string;
  player_name: string;
  course_name: string;
  hole_count: number;
  ended_at: number;
  can_cancel: boolean;
};
export type Receipt = {
  receipt_id: string;
  round_id: string;
  user_id: string;
  player_slot_id: string;
  delivery_id: string;
  status: "received" | "deleted";
  received_at: number;
  deleted_at: number | null;
};
export type ReceiptItem = Receipt & {
  course_name: string;
  hole_count: number;
  ended_at: number;
  player_name: string;
  holes_recorded: number;
  total_strokes: number | null;
  current_player: number;
};
export type Page<T> = { items: T[]; next_cursor: string | null };
export type ReceiveAction = {
  action_id: string;
  delivery: Delivery;
  ad_settled: boolean;
  test_ads: boolean;
  completed_receipt: Receipt | null;
  available: boolean;
};
export type RecordDetail = {
  receipt: Receipt;
  sheet: ScoreSheet | null;
  ended_at: number;
  can_manage: boolean;
  current_player: boolean;
  slot_version: number;
  edit: EditAccess;
  // Populated by the Peoria stage; a receipt grants access to the whole round.
  peoria_runs: unknown[];
};
