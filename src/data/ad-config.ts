export type AdMode = "mock" | "admob-test" | "disabled";
export type AdSource = "development-test" | "admob-test";
export type AdEvidence = {
  outcome: Exclude<import("./ad-policy").AdOutcome, "interrupted">;
  source: AdSource;
};
// No implicit production fallback, no live ad IDs in the development client.
export function resolveAdMode(platform: string, setting?: string): AdMode {
  if (setting === "disabled") return "disabled";
  if (platform === "web")
    return !setting || setting === "mock" ? "mock" : "disabled";
  if (platform !== "android" && platform !== "ios") return "disabled";
  return !setting || setting === "admob-test" ? "admob-test" : "disabled";
}
