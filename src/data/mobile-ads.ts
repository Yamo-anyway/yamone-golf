import Constants from "expo-constants";
import { AppState, Platform, StatusBar } from "react-native";
import { resolveAdMode, type AdEvidence } from "./ad-config";
import {
  runInterstitial,
  awaitAdTask,
  waitForAdForeground,
  type AdLifecycle,
} from "./interstitial-core";

export const adMode = resolveAdMode(
  Platform.OS,
  process.env.EXPO_PUBLIC_ADS_MODE,
);
const lifecycle: AdLifecycle = {
  active: () => AppState.currentState === "active",
  subscribe: (listener) => {
    const sub = AppState.addEventListener("change", (s) =>
      listener(s === "active"),
    );
    return () => sub.remove();
  },
};
type SDK = typeof import("react-native-google-mobile-ads");
let ready: Promise<SDK | null> | undefined;
let presenting = false;
export function prepareMobileAds(): Promise<SDK | null> {
  if (
    adMode !== "admob-test" ||
    Constants.executionEnvironment === "storeClient"
  )
    return Promise.reject({ code: "ad_native_build_required" });
  if (!ready) {
    ready = (async () => {
      let sdk: SDK;
      try {
        sdk = await import("react-native-google-mobile-ads");
      } catch {
        throw { code: "ad_native_build_required" };
      }
      if (!lifecycle.active()) throw { code: "ad_interrupted" };
      // UMP owns consent. No location, nickname, round, or personal code is sent.
      try {
        await sdk.AdsConsent.gatherConsent();
      } catch {
        /* Check cached UMP consent below. */
      }
      try {
        if (!(await sdk.AdsConsent.getConsentInfo()).canRequestAds) return null;
      } catch {
        return null;
      }
      try {
        await sdk.default().initialize();
      } catch {
        throw { code: "ad_initialization_failed" };
      }
      return sdk;
    })().catch((e) => {
      ready = undefined;
      throw e;
    });
  }
  return ready;
}
export async function presentInterstitial(
  testAllowed: boolean,
  signal: AbortSignal,
): Promise<AdEvidence> {
  if (!testAllowed || adMode !== "admob-test")
    throw { code: "ads_not_configured" };
  if (presenting) throw { code: "ad_busy" };
  if (Constants.executionEnvironment === "storeClient")
    throw { code: "ad_native_build_required" };
  if (signal.aborted || !lifecycle.active()) throw { code: "ad_interrupted" };
  presenting = true;
  try {
    let sdk: SDK | null;
    try {
      sdk = await awaitAdTask(prepareMobileAds(), signal);
    } catch (error) {
      if (signal.aborted || !lifecycle.active())
        throw { code: "ad_interrupted" };
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ad_initialization_failed"
      )
        return { outcome: "load_failed", source: "admob-test" };
      // Native-module/configuration errors must not masquerade as a watched ad.
      throw { code: "ad_native_build_required" };
    }
    if (signal.aborted || !lifecycle.active()) throw { code: "ad_interrupted" };
    if (!sdk) return { outcome: "unavailable", source: "admob-test" };
    const ad = sdk.InterstitialAd.createForAdRequest(sdk.TestIds.INTERSTITIAL, {
      requestNonPersonalizedAdsOnly: true,
    });
    let hiddenStatusBar = false;
    const outcome = await runInterstitial(
      {
        on: (event, listener) =>
          ad.addAdEventListener(
            {
              loaded: sdk.AdEventType.LOADED,
              opened: sdk.AdEventType.OPENED,
              closed: sdk.AdEventType.CLOSED,
              error: sdk.AdEventType.ERROR,
            }[event],
            () => {
              if (event === "opened" && Platform.OS === "ios") {
                StatusBar.setHidden(true);
                hiddenStatusBar = true;
              }
              listener();
            },
          ),
        load: () => ad.load(),
        show: () => ad.show(),
        destroy: () => {
          if (hiddenStatusBar) StatusBar.setHidden(false);
          ad.destroy();
        },
      },
      lifecycle,
      signal,
    );
    if (outcome === "interrupted") throw { code: "ad_interrupted" };
    return { outcome, source: "admob-test" };
  } finally {
    presenting = false;
  }
}
export const waitUntilAdForeground = (signal: AbortSignal) =>
  waitForAdForeground(lifecycle, signal);

export async function showAdPrivacyOptions(): Promise<boolean> {
  if (
    adMode !== "admob-test" ||
    Constants.executionEnvironment === "storeClient"
  )
    return false;
  const sdk = await import("react-native-google-mobile-ads");
  const info = await sdk.AdsConsent.requestInfoUpdate();
  if (
    info.privacyOptionsRequirementStatus !==
    sdk.AdsConsentPrivacyOptionsRequirementStatus.REQUIRED
  )
    return false;
  await sdk.AdsConsent.showPrivacyOptionsForm();
  ready = undefined; // Recheck consent before any future request.
  return true;
}
