import { request } from "./api";
import type { ScoreSheet, ScoreWrite } from "../../shared/scores";
export const scores = {
  get: (round: string) =>
    request<ScoreSheet>("/api/rounds/" + round + "/scores"),
  save: (round: string, value: ScoreWrite) =>
    request<{ sheet: ScoreSheet; replayed: boolean }>(
      "/api/rounds/" + round + "/scores",
      "PUT",
      value,
    ),
};
