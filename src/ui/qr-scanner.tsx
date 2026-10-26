import React, { useRef, useState } from "react";
import { AppState, Modal, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { useIsFocused } from "expo-router/react-navigation";
import { Button, colors, Txt } from "./components";
import { useSession } from "./session";
import { normalizePersonalCode } from "../../shared/personal-code";
import { normalizeRoundCode } from "../../shared/round-code";
export function QRScanner({
  onCode,
  onClose,
  kind = "personal",
}: {
  kind?: "personal" | "round";
  onCode: (code: string) => void;
  onClose: () => void;
}) {
  const { t } = useSession(),
    [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState(false),
    [invalid, setInvalid] = useState(false),
    [active, setActive] = useState(AppState.currentState === "active");
  const accepted = useRef(false),
    focused = useIsFocused();
  useFocusEffect(
    React.useCallback(() => {
      const sub = AppState.addEventListener("change", (state) =>
        setActive(state === "active"),
      );
      return () => sub.remove();
    }, []),
  );
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView
        style={{ flex: 1, backgroundColor: colors.paper, padding: 22, gap: 18 }}
      >
        <Txt style={{ fontSize: 24, lineHeight: 32, fontWeight: "700" }}>
          {t(kind === "round" ? "roundQRScan" : "qrScan")}
        </Txt>
        <Txt>{t(kind === "round" ? "roundQRScanHelp" : "qrScanHelp")}</Txt>
        {!permission ? (
          <Txt>{t("loading")}</Txt>
        ) : !permission.granted ? (
          <>
            <Txt>{t("cameraHelp")}</Txt>
            {permission.canAskAgain ? (
              <Button
                label={t("allowCamera")}
                onPress={() =>
                  void requestPermission().catch(() => setError(true))
                }
              />
            ) : (
              <Txt>{t("cameraUnavailable")}</Txt>
            )}
          </>
        ) : active && focused && !error ? (
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onMountError={() => setError(true)}
            onBarcodeScanned={(event) => {
              if (accepted.current || !active || !focused) return;
              const code = (
                kind === "round" ? normalizeRoundCode : normalizePersonalCode
              )(event.data);
              if (!code) {
                setInvalid(true);
                return;
              }
              accepted.current = true;
              onCode(code);
            }}
          />
        ) : (
          <View style={{ flex: 1 }} />
        )}
        {invalid && (
          <Txt accessibilityRole="alert">
            {t(
              kind === "round" ? "invalid_round_code" : "invalid_personal_code",
            )}
          </Txt>
        )}
        {error && <Txt accessibilityRole="alert">{t("cameraUnavailable")}</Txt>}
        <Button label={t("closeScan")} secondary onPress={onClose} />
      </SafeAreaView>
    </Modal>
  );
}
