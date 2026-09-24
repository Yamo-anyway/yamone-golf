import React, { useEffect, useState } from "react";
import { View, useWindowDimensions } from "react-native";
import { request } from "../data/api";
import { adMode, prepareMobileAds } from "../data/mobile-ads";

type SDK = typeof import("react-native-google-mobile-ads");
const requestOptions = { requestNonPersonalizedAdsOnly: true };
export function AdBanner() {
  const [sdk, setSDK] = useState<SDK | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      if (adMode !== "admob-test") return;
      const config = await request<{ test_ads: boolean }>("/api/ad-config");
      if (!alive || !config.test_ads) return;
      const ready = await prepareMobileAds();
      if (alive) setSDK(ready);
    })().catch(() => {
      /* No placeholder on unavailable/failed ads. */
    });
    return () => {
      alive = false;
    };
  }, []);
  const width = Math.floor(Math.min(useWindowDimensions().width, 520));
  return sdk ? <LoadedBanner key={width} sdk={sdk} width={width} /> : null;
}
function LoadedBanner({ sdk, width }: { sdk: SDK; width: number }) {
  const [height, setHeight] = useState(0),
    [failed, setFailed] = useState(false);
  const Banner = sdk.BannerAd;
  useEffect(() => {
    if (height > 0 || failed) return;
    const timer = setTimeout(() => setFailed(true), 15_000);
    return () => clearTimeout(timer);
  }, [height, failed]);
  if (failed) return null;
  return (
    <View
      testID="ad-banner"
      style={{ height, width, alignSelf: "center", overflow: "hidden" }}
    >
      <Banner
        unitId={sdk.TestIds.ADAPTIVE_BANNER}
        width={width}
        size={sdk.BannerAdSize.LARGE_ANCHORED_ADAPTIVE_BANNER}
        requestOptions={requestOptions}
        onAdLoaded={(size) => setHeight(size.height)}
        onSizeChange={(size) =>
          setHeight((current) => (current > 0 ? size.height : 0))
        }
        onAdFailedToLoad={() => setFailed(true)}
      />
    </View>
  );
}
