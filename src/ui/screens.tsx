import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, usePathname } from "expo-router";
import { useNavigation, usePreventRemove } from "expo-router/react-navigation";
import Svg, { Path, Rect } from "react-native-svg";
import { create } from "qrcode/lib/core/qrcode";
import { Button, Card, colors, Field, styles, Txt } from "./components";
import { useErrorText, useSession } from "./session";
import { HomeRounds } from "./rounds";
import type { Language } from "../data/model";

function PersonalQR({ value, label }: { value: string; label: string }) {
  const matrix = useMemo(
    () => create(value, { errorCorrectionLevel: "M" }).modules,
    [value],
  );
  let d = "";
  for (let y = 0; y < matrix.size; y++)
    for (let x = 0; x < matrix.size; x++)
      if (matrix.get(y, x)) d += `M${x + 4} ${y + 4}h1v1h-1z`;
  return (
    <View style={{ alignItems: "center" }}>
      <Svg
        accessibilityLabel={label}
        accessibilityRole="image"
        width={196}
        height={196}
        viewBox={`0 0 ${matrix.size + 8} ${matrix.size + 8}`}
      >
        <Rect width="100%" height="100%" fill="white" />
        <Path d={d} fill={colors.ink} />
      </Svg>
    </View>
  );
}
function Welcome() {
  const s = useSession();
  const [restoring, setRestoring] = useState(s.startWithRecovery),
    [name, setName] = useState(""),
    [key, setKey] = useState("");
  return (
    <>
      <View style={{ paddingTop: 28, paddingBottom: 12, gap: 16 }}>
        <Txt style={styles.title}>
          {s.t(restoring ? "recovery" : "welcome")}
        </Txt>
        <Txt style={{ color: colors.muted }}>
          {s.t(restoring ? "recoveryHelp" : "intro")}
        </Txt>
      </View>
      {restoring ? (
        <>
          <Field
            label={s.t("recoveryKey")}
            testID="recovery-key"
            value={key}
            onChangeText={setKey}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={80}
            editable={!s.busy}
          />
          <Button
            label={s.t("recover")}
            testID="recover"
            disabled={!key.trim()}
            busy={s.busy}
            onPress={() => void s.recover(key)}
          />
        </>
      ) : (
        <>
          <Field
            label={s.t("nickname")}
            testID="nickname"
            value={name}
            onChangeText={setName}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={16}
            editable={!s.busy}
            returnKeyType="done"
            onSubmitEditing={() => {
              if (name.trim()) void s.start(name);
            }}
          />
          <Txt style={{ color: colors.muted, fontSize: 14, lineHeight: 21 }}>
            {s.t("nicknameHint")}
          </Txt>
          <Button
            label={s.t("start")}
            testID="start"
            disabled={!name.trim()}
            busy={s.busy}
            onPress={() => void s.start(name)}
          />
        </>
      )}
      <Button
        label={s.t(restoring ? "back" : "restore")}
        secondary
        disabled={s.busy}
        onPress={() => setRestoring(!restoring)}
      />
    </>
  );
}
function BackupKey() {
  const { vault, t, acknowledgeKey } = useSession();
  if (!vault.keyToSave) return null;
  return (
    <Card>
      <Txt style={{ fontSize: 20, lineHeight: 28, fontWeight: "700" }}>
        {t("backupTitle")}
      </Txt>
      <Txt>{t("backupBody")}</Txt>
      <Txt
        testID="backup-key"
        selectable
        style={{
          fontSize: 18,
          lineHeight: 28,
          letterSpacing: 0.5,
          fontWeight: "700",
        }}
      >
        {vault.keyToSave}
      </Txt>
      <Txt style={{ fontSize: 13, color: colors.muted }}>{t("selectHint")}</Txt>
      <Button
        label={t("backupDone")}
        testID="backup-done"
        onPress={() => void acknowledgeKey()}
      />
    </Card>
  );
}
export function Home() {
  const { profile, t } = useSession();
  if (!profile) return null;
  return (
    <>
      <Txt style={styles.title}>
        {profile.nickname}
        {t("greeting")}
      </Txt>
      <Txt>{t("ready")}</Txt>
      <BackupKey />
      <HomeRounds />
      <Card>
        <Txt style={{ color: colors.muted }}>{t("code")}</Txt>
        <Txt
          selectable
          testID="personal-code"
          style={{
            fontSize: 24,
            lineHeight: 32,
            fontWeight: "800",
            letterSpacing: 1,
          }}
        >
          {profile.personal_code}
        </Txt>
        <Txt style={{ color: colors.muted }}>{t("codeHelp")}</Txt>
        <Button
          label={t("profile")}
          secondary
          onPress={() => router.push("/profile")}
        />
      </Card>
    </>
  );
}
export function ProfileScreen() {
  const s = useSession();
  const [editing, setEditing] = useState(false),
    [name, setName] = useState(""),
    [qr, setQR] = useState(false),
    [saved, setSaved] = useState(false);
  const navigation = useNavigation();
  usePreventRemove(
    s.phase === "ready" && editing && name.trim() !== s.profile?.nickname,
    ({ data }) => {
      const leave = () => navigation.dispatch(data.action);
      if (Platform.OS === "web") {
        if (window.confirm(s.t("unsavedBody"))) leave();
      } else
        Alert.alert(s.t("unsavedTitle"), s.t("unsavedBody"), [
          { text: s.t("keepEditing"), style: "cancel" },
          { text: s.t("discard"), onPress: leave },
        ]);
    },
  );
  if (!s.profile) return null;
  const p = s.profile;
  return (
    <>
      <Txt style={styles.title}>{s.t("profile")}</Txt>
      <BackupKey />
      <Card>
        {editing ? (
          <>
            <Field
              label={s.t("nickname")}
              testID="edit-nickname"
              value={name}
              onChangeText={setName}
              maxLength={16}
              editable={!s.busy}
              autoCapitalize="none"
            />
            <Button
              label={s.t("save")}
              testID="save-nickname"
              disabled={!name.trim()}
              busy={s.busy}
              onPress={async () => {
                if (await s.update({ nickname: name })) {
                  setEditing(false);
                  setSaved(true);
                }
              }}
            />
            <Button
              label={s.t("cancel")}
              secondary
              disabled={s.busy}
              onPress={() => setEditing(false)}
            />
          </>
        ) : (
          <>
            <Txt style={{ fontSize: 23, lineHeight: 32, fontWeight: "700" }}>
              {p.nickname}
            </Txt>
            <Button
              label={s.t("change")}
              testID="edit-profile"
              secondary
              onPress={() => {
                setName(p.nickname);
                setEditing(true);
                setSaved(false);
              }}
            />
          </>
        )}
        <Txt style={{ fontSize: 14, color: colors.muted }}>
          {s.t("nicknameChanged")}
        </Txt>
        {saved && <Txt accessibilityLiveRegion="polite">{s.t("saved")}</Txt>}
      </Card>
      <Card>
        <Txt>{s.t("code")}</Txt>
        <Txt
          selectable
          testID="personal-code"
          style={{ fontSize: 24, lineHeight: 32, fontWeight: "800" }}
        >
          {p.personal_code}
        </Txt>
        <Button
          label={s.t(qr ? "qrHide" : "qrShow")}
          secondary
          onPress={() => setQR(!qr)}
        />
        {qr && <PersonalQR value={p.personal_qr} label={s.t("qrLabel")} />}
      </Card>
      <Card>
        <Txt style={{ fontWeight: "700" }}>{s.t("language")}</Txt>
        {(["system", "ko", "en"] as Language[]).map((l) => (
          <Button
            key={l}
            label={
              (p.language === l ? "✓ " : "") +
              s.t(l === "system" ? "system" : l === "ko" ? "korean" : "english")
            }
            secondary={p.language !== l}
            disabled={s.busy}
            onPress={() => void s.update({ language: l })}
          />
        ))}
        <Txt style={{ color: colors.muted, fontSize: 14 }}>
          {s.t("languageHint")}
        </Txt>
      </Card>
    </>
  );
}
function Gate({ children }: { children: React.ReactNode }) {
  const s = useSession();
  if (s.phase === "ready") return <>{children}</>;
  if (s.phase === "welcome") return <Welcome />;
  if (s.phase === "loading")
    return (
      <>
        <ActivityIndicator color={colors.green} />
        <Txt>{s.t("loading")}</Txt>
      </>
    );
  if (s.phase === "pending")
    return (
      <>
        <Txt style={styles.title}>{s.t("pendingTitle")}</Txt>
        <Txt>{s.t("pendingBody")}</Txt>
        <Button
          label={s.t("resume")}
          testID="resume"
          busy={s.busy}
          onPress={() => void s.resume()}
        />
      </>
    );
  if (s.phase === "moved" || s.phase === "expired")
    return (
      <>
        <Txt style={styles.title}>
          {s.t(s.phase === "moved" ? "movedTitle" : "sessionExpired")}
        </Txt>
        <Txt>
          {s.t(s.phase === "moved" ? "movedBody" : "sessionExpiredBody")}
        </Txt>
        <Button
          label={s.t("newUser")}
          secondary
          onPress={() => {
            if (Platform.OS === "web") {
              if (window.confirm(s.t("freshConfirm"))) void s.fresh();
            } else
              Alert.alert(s.t("newUser"), s.t("freshConfirm"), [
                { text: s.t("cancel"), style: "cancel" },
                { text: s.t("newUser"), onPress: () => void s.fresh() },
              ]);
          }}
        />
        {s.phase === "expired" && (
          <Button
            label={s.t("recoveryEntry")}
            onPress={() => void s.fresh(true)}
          />
        )}
      </>
    );
  return (
    <>
      <Txt style={styles.title}>{s.t("retry")}</Txt>
      <Button
        label={s.t("retry")}
        busy={s.busy}
        onPress={() => void s.refresh()}
      />
    </>
  );
}
export function Shell({ children }: { children: React.ReactNode }) {
  const s = useSession(),
    error = useErrorText(),
    path = usePathname();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={{
            paddingHorizontal: 22,
            paddingVertical: 18,
            borderBottomWidth: 1,
            borderColor: colors.line,
          }}
        >
          <Txt style={{ fontSize: 15, letterSpacing: 2, fontWeight: "800" }}>
            {s.t("brand")}
          </Txt>
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: 22,
            paddingBottom: 32,
            gap: 20,
            maxWidth: 520,
            width: "100%",
            alignSelf: "center",
            flexGrow: 1,
          }}
        >
          {error && (
            <View
              accessibilityRole="alert"
              style={{
                backgroundColor: "#FCECE7",
                padding: 14,
                borderRadius: 12,
              }}
            >
              <Txt style={{ color: colors.error }}>{error}</Txt>
            </View>
          )}
          <Gate>{children}</Gate>
        </ScrollView>
        {s.phase === "ready" && (
          <View
            style={{
              borderTopWidth: 1,
              borderColor: colors.line,
              backgroundColor: "#FFFFFF",
              flexDirection: "row",
            }}
          >
            {(["/", "/profile"] as const).map((route) => (
              <Pressable
                key={route}
                accessibilityRole="tab"
                accessibilityState={{ selected: path === route }}
                onPress={() => {
                  if (path !== route) router.dismissTo(route);
                }}
                style={{
                  flex: 1,
                  padding: 18,
                  minHeight: 58,
                  alignItems: "center",
                  backgroundColor: path === route ? colors.mint : "#FFFFFF",
                }}
              >
                <Txt style={{ fontWeight: path === route ? "800" : "500" }}>
                  {s.t(route === "/" ? "home" : "profile")}
                </Txt>
              </Pressable>
            ))}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
