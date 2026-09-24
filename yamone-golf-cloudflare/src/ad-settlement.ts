import { ApiError } from "./shared";

export const allowsTestAds = (environment: string) =>
  ["development", "test", "ui-test"].includes(environment);

// These sources are labels for diagnostics, NOT trusted provider proof. A
// client cannot enable live settlement by calling itself "admob"/"production".
export function testAdEvidence(
  environment: string,
  body: Record<string, unknown>,
) {
  if (!allowsTestAds(environment))
    throw new ApiError("ads_not_configured", 503);
  const source = body.source ?? "development-test";
  if (source !== "development-test" && source !== "admob-test")
    throw new ApiError("ads_not_configured", 503);
  if (
    ![
      "completed",
      "unavailable",
      "load_failed",
      "show_failed",
      "load_timeout",
    ].includes(String(body.outcome))
  )
    throw new ApiError("ad_interrupted", 409);
  return { source, outcome: String(body.outcome) };
}
