import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { request } from "../data/api";
import { adMode } from "../data/mobile-ads";
import { Txt } from "./components";
import { useSession } from "./session";
// Explicit QA build only. Never represents paid inventory or a settlement.
export function AdBanner() {
  const { t } = useSession();
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    if (
      process.env.EXPO_PUBLIC_ADS_BANNER_FIXTURE === "1" &&
      adMode === "mock"
    ) {
      void request<{ test_ads: boolean }>("/api/ad-config")
        .then((config) => {
          if (
            alive &&
            config.test_ads &&
            localStorage.getItem("ymg:qa-banner-fail") !== "1"
          )
            setLoaded(true);
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, []);
  if (!loaded) return null;
  return (
    <View
      testID="ad-banner"
      style={{
        height: 50,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#E7F0E7",
      }}
    >
      <Txt style={{ fontSize: 12 }}>{t("adBannerFixture")}</Txt>
    </View>
  );
}
