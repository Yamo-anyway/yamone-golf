import React, { useCallback, useRef } from "react";
import { useFocusEffect } from "expo-router";
import type { AdEvidence } from "../data/ad-config";
import { adMode } from "../data/mobile-ads";
import { Button, Card, Txt } from "./components";
import { useSession } from "./session";

export function useAdActionLifetime() {
  const controller = useRef(new AbortController());
  useFocusEffect(
    useCallback(() => {
      if (controller.current.signal.aborted)
        controller.current = new AbortController();
      return () => controller.current.abort();
    }, []),
  );
  return controller;
}
export function AdAction({
  testAllowed,
  busy,
  prefix = "",
  onRun,
}: {
  testAllowed: boolean;
  busy: boolean;
  prefix?: string;
  onRun: (mock?: AdEvidence) => void;
}) {
  const { t } = useSession();
  if (!testAllowed || adMode === "disabled")
    return <Txt>{t("ads_not_configured")}</Txt>;
  if (adMode === "mock")
    return (
      <Card>
        <Txt style={{ fontWeight: "700" }}>{t("testAdTitle")}</Txt>
        <Txt>{t("testAdBody")}</Txt>
        <Button
          label={t("testAdComplete")}
          testID={prefix + "ad-complete"}
          busy={busy}
          onPress={() =>
            onRun({ outcome: "completed", source: "development-test" })
          }
        />
        <Button
          label={t("testAdUnavailable")}
          testID={prefix + "ad-unavailable"}
          secondary
          disabled={busy}
          onPress={() =>
            onRun({ outcome: "unavailable", source: "development-test" })
          }
        />
      </Card>
    );
  return (
    <Card>
      <Txt>{t("nativeAdHelp")}</Txt>
      <Button
        label={t("nativeAdContinue")}
        testID={prefix + "ad-native"}
        busy={busy}
        onPress={() => onRun()}
      />
    </Card>
  );
}
