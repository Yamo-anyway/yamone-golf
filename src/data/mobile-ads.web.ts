import { resolveAdMode } from "./ad-config";
import type { AdEvidence } from "./ad-config";
export const adMode = resolveAdMode("web", process.env.EXPO_PUBLIC_ADS_MODE);
export async function presentInterstitial(
  _allowed: boolean,
  _signal: AbortSignal,
): Promise<AdEvidence> {
  throw { code: "ad_native_build_required" };
}
export async function waitUntilAdForeground(signal: AbortSignal) {
  if (signal.aborted) throw { code: "ad_interrupted" };
}
export async function showAdPrivacyOptions() {
  return false;
}
