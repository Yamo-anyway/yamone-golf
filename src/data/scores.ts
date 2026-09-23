import { request } from "./api";
import type { ScoreSheet, ScoreWrite } from "../../shared/scores";
export const scores = {
  get: (round: string, user?: string) =>
    request<ScoreSheet>(
      "/api/rounds/" +
        round +
        "/scores" +
        (user ? "?user_id=" + encodeURIComponent(user) : ""),
    ),
  save: (round: string, value: ScoreWrite) =>
    request<{ sheet: ScoreSheet; replayed: boolean }>(
      "/api/rounds/" + round + "/scores",
      "PUT",
      value,
    ),
};
