// These are policy functions, not an ad SDK or a record that an ad was watched.
// The round backend persists the (user_id, round_id) settlement at create/join.
export type BannerContext = {
  screen:
    | "home"
    | "record-list"
    | "record-detail"
    | "scorecard"
    | "statistics"
    | "peoria"
    | "profile"
    | "other";
  flow: "browse" | "round" | "record";
  roundEnded?: boolean;
  fullscreen?: boolean;
  editing?: boolean;
};
export function showBanner(c: BannerContext) {
  if (c.fullscreen || c.editing || c.flow === "round") return false;
  if (c.screen === "home" && c.flow === "browse") return true;
  if (c.flow !== "record") return false;
  if (c.screen === "record-list" || c.screen === "statistics") return true;
  return (
    c.roundEnded === true &&
    ["record-detail", "scorecard", "peoria"].includes(c.screen)
  );
}
export type AdOutcome =
  | "completed"
  | "unavailable"
  | "load_failed"
  | "show_failed"
  | "load_timeout"
  | "interrupted";
export const adAllowsAction = (outcome: AdOutcome) => outcome !== "interrupted";
export function needsRoundAd(
  action: "create" | "join" | "receive" | "end" | "score",
  settled: boolean,
) {
  return !settled && ["create", "join", "receive"].includes(action);
}
