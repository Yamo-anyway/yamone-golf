import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Modal, Platform, Pressable, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useNavigation, usePreventRemove } from "expo-router/react-navigation";
import { corrections, personalAPI } from "../data/corrections";
import type { CorrectionState } from "../data/corrections-core";
import { useSession } from "./session";
import { confirm, useTask } from "./golf-hooks";
import { Heading, Problem } from "./courses";
import { Button, Card, Txt, colors } from "./components";
export function CorrectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    { profile, t, lang, phase } = useSession(),
    navigation = useNavigation();
  const store = corrections(profile!.user_id),
    api = useMemo(() => personalAPI(profile!.user_id), [profile]);
  const task = useTask(),
    [state, setState] = useState<CorrectionState | null>(null),
    [leave, setLeave] = useState<(() => void) | null>(null);
  const proceed = useRef<(() => void) | null>(null),
    mounted = useRef(true),
    [notice, setNotice] = useState("");
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const read = useCallback(async () => {
    const r = await store.read(id);
    if (mounted.current) setState(r);
  }, [store, id]);
  const { report } = task;
  const refresh = useCallback(async () => {
    try {
      await read();
      await store.refresh(id, api);
      await read();
    } catch (e) {
      report(e);
      try {
        await read();
      } catch {
        /* Preserve unreadable storage and report the original failure. */
      }
    }
  }, [api, id, read, report, store]);
  useFocusEffect(
    useCallback(() => {
      void refresh();
      const sub = AppState.addEventListener("change", (s) => {
        if (s === "active") void refresh();
      });
      return () => sub.remove();
    }, [refresh]),
  );
  const run = async (fn: () => Promise<unknown>) =>
    task.run(async () => {
      setNotice("");
      try {
        return await fn();
      } finally {
        await read();
      }
    });
  const dirty =
    !!state && (Object.keys(state.drafts).length > 0 || !!state.pending);
  usePreventRemove(phase === "ready" && (dirty || task.busy), ({ data }) =>
    setLeave(() => () => navigation.dispatch(data.action)),
  );
  useEffect(() => {
    if (proceed.current && !task.busy) {
      const fn = proceed.current;
      proceed.current = null;
      fn();
    }
  }, [state, task.busy]);
  useEffect(() => {
    if (Platform.OS !== "web" || !dirty) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  const v = state?.view,
    hole = state?.hole ?? 1,
    draft = state?.drafts[hole],
    pending = state?.pending;
  const score = v?.scores.find((s) => s.hole === hole),
    pars = v?.course.segments.flatMap((s) => s.pars) ?? [];
  const value = draft ? draft.strokes : (score?.strokes ?? null),
    display = value ?? pars[hole - 1];
  const blocked =
    task.busy ||
    !v?.edit.allowed ||
    !!state?.needsRefresh ||
    pending?.write.hole === hole;
  async function save(
    mode: "save" | "confirm" | "retry" = "save",
    after?: () => void,
  ) {
    await run(async () => {
      await store.send(
        id,
        mode === "save" ? hole : pending!.write.hole,
        api,
        mode,
      );
      await store.refresh(id, api);
      setNotice(t("saved"));
      if (after) proceed.current = after;
    });
  }
  function visit(h: number) {
    const go = () => {
      void run(() => store.visit(id, h));
    };
    if (draft || pending?.write.hole === hole) setLeave(() => go);
    else go();
  }
  return (
    <>
      <Heading title={t("editMyScores")} />
      <Problem text={task.errorText} />
      {notice && <Txt testID="correction-saved">{notice}</Txt>}
      {v && state && (
        <View style={{ gap: 12 }}>
          <Txt style={{ fontWeight: "700" }}>
            {v.course.name} · {v.player_name}
          </Txt>
          {state.needsRefresh && <Txt>{t("correction_refresh")}</Txt>}
          <Txt style={{ fontSize: 13, color: colors.muted }}>
            {t("editDeadline")} ·{" "}
            {new Date(v.edit.deadline).toLocaleString(
              lang === "ko" ? "ko-KR" : "en-US",
            )}
          </Txt>
          {!v.edit.allowed && (
            <Txt testID="correction-locked">
              {t(
                v.edit.reason === "available" ? "record_locked" : v.edit.reason,
              )}
            </Txt>
          )}
          <View style={{ flexDirection: "row", gap: 8 }}>
            {v.course.segments.map((seg, i) => (
              <View key={i} style={{ flex: 1 }}>
                <Button
                  label={t(i === 0 ? "frontNine" : "backNine")}
                  secondary={Math.floor((hole - 1) / 9) !== i}
                  disabled={task.busy}
                  onPress={() => visit(i * 9 + 1)}
                />
              </View>
            ))}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {Array.from(
              { length: 9 },
              (_, i) => Math.floor((hole - 1) / 9) * 9 + i + 1,
            ).map((h) => (
              <Pressable
                key={h}
                testID={"correction-hole-" + h}
                accessibilityRole="button"
                accessibilityLabel={t("hole") + " " + h}
                disabled={task.busy}
                onPress={() => visit(h)}
                style={{
                  minWidth: 44,
                  minHeight: 44,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: hole === h ? colors.green : "#fff",
                  borderColor: colors.line,
                  borderWidth: 1,
                  borderRadius: 10,
                }}
              >
                <Txt style={{ color: hole === h ? "#fff" : colors.ink }}>
                  {h}
                  {state.drafts[h] ? " ·" : ""}
                </Txt>
              </Pressable>
            ))}
          </View>
          <Txt
            testID="correction-current-hole"
            style={{ fontSize: 24, lineHeight: 32, fontWeight: "800" }}
          >
            {t("hole")} {hole} · PAR {pars[hole - 1]}
          </Txt>
          <Txt testID="correction-state">
            {t(
              draft
                ? "scoreUnsaved"
                : score?.strokes == null
                  ? "notEntered"
                  : "saved",
            )}
          </Txt>
          <View style={{ gap: 8, flexDirection: "row" }}>
            <View style={{ flex: 1 }}>
              <Button
                label={t(score?.strokes == null ? "saveHole" : "editHole")}
                testID="save-correction"
                disabled={blocked || !!pending}
                onPress={() => void save()}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label={t("cancel")}
                testID="discard-correction"
                secondary
                disabled={
                  task.busy ||
                  (!draft && !pending) ||
                  (pending?.write.hole === hole && pending.state === "unknown")
                }
                onPress={() =>
                  void confirm(
                    t("discardCorrectionHelp"),
                    t("discard"),
                    t("keepEditing"),
                  ).then((yes) => {
                    if (yes) void run(() => store.discard(id, hole));
                  })
                }
              />
            </View>
            {score?.strokes != null && (
              <View style={{ flex: 1 }}>
                <Button
                  label={t("deleteHole")}
                  testID="delete-correction"
                  secondary
                  disabled={blocked || !!pending}
                  onPress={() =>
                    void confirm(
                      t("deleteOwnHoleHelp"),
                      t("deleteHole"),
                      t("cancel"),
                    ).then((yes) => {
                      if (yes)
                        void run(async () => {
                          await store.change(id, hole, null);
                          await store.send(id, hole, api);
                          await store.refresh(id, api);
                          setNotice(t("saved"));
                        });
                    })
                  }
                />
              </View>
            )}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Txt style={{ flex: 1 }}>{v.player_name}</Txt>
            <Pressable
              testID="correction-minus"
              accessibilityRole="button"
              accessibilityLabel={t("decreaseScore")}
              disabled={blocked || display <= 1}
              onPress={() =>
                void run(() => store.change(id, hole, Math.max(1, display - 1)))
              }
              style={{ padding: 12, minWidth: 44 }}
            >
              <Txt>−</Txt>
            </Pressable>
            <Txt
              testID="correction-value"
              style={{ fontSize: 28, lineHeight: 38, fontWeight: "800" }}
            >
              {display}
            </Txt>
            <Pressable
              testID="correction-plus"
              accessibilityRole="button"
              accessibilityLabel={t("increaseScore")}
              disabled={blocked || display >= 999}
              onPress={() =>
                void run(() =>
                  store.change(id, hole, Math.min(999, display + 1)),
                )
              }
              style={{ padding: 12, minWidth: 44 }}
            >
              <Txt>+</Txt>
            </Pressable>
          </View>
          {draft?.strokes === null && <Txt>{t("pendingDeleteOwnHole")}</Txt>}
          {!!Object.keys(state.drafts).length && (
            <Txt testID="correction-drafts">
              {t("draftHoles")}: {Object.keys(state.drafts).join(", ")}
            </Txt>
          )}
          {pending && (
            <Card>
              <Txt>
                {t(
                  pending.state === "unknown"
                    ? "correctionPendingHelp"
                    : pending.state === "blocked"
                      ? "correctionBlockedHelp"
                      : "overwriteScores",
                )}
              </Txt>
              <Txt>
                {t("hole")} {pending.write.hole} ·{" "}
                {pending.write.strokes ?? t("notEntered")}
              </Txt>
              {pending.state === "conflict" && pending.conflict ? (
                <>
                  <Txt testID="correction-conflict">
                    {pending.conflict.current.strokes ?? t("notEntered")} →{" "}
                    {pending.write.strokes ?? t("notEntered")}
                  </Txt>
                  <Button
                    label={t("overwriteScores")}
                    testID="confirm-correction"
                    disabled={task.busy}
                    onPress={() => void save("confirm")}
                  />
                  <Button
                    label={t("useLatestScores")}
                    testID="reject-correction"
                    secondary
                    disabled={task.busy}
                    onPress={() => void run(() => store.reject(id))}
                  />
                </>
              ) : (
                <Button
                  label={t("retry")}
                  testID="retry-correction"
                  secondary
                  disabled={task.busy}
                  onPress={() => void save("retry")}
                />
              )}
            </Card>
          )}
        </View>
      )}
      <Txt style={{ fontSize: 13, color: colors.muted }}>
        {t("personalEditHelp")}
      </Txt>
      <Button
        label={t("refresh")}
        testID="refresh-correction"
        secondary
        disabled={task.busy}
        onPress={() => void refresh()}
      />
      {leave && (
        <Modal
          transparent
          animationType="fade"
          onRequestClose={() => setLeave(null)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "#0008",
              justifyContent: "center",
              padding: 20,
            }}
          >
            <Card>
              <Txt>{t("scoreLeaveTitle")}</Txt>
              <Txt>{t("correctionLeaveHelp")}</Txt>
              <Button
                label={t("saveAndMove")}
                testID="correction-save-move"
                disabled={
                  blocked ||
                  !!pending ||
                  !draft ||
                  Object.keys(state?.drafts ?? {}).length > 1
                }
                onPress={() => {
                  const fn = leave;
                  setLeave(null);
                  void save("save", fn);
                }}
              />
              <Button
                label={t("keepDraftAndMove")}
                testID="correction-keep-move"
                secondary
                disabled={task.busy}
                onPress={() => {
                  const fn = leave;
                  setLeave(null);
                  proceed.current = fn;
                  setState((s) => (s ? { ...s } : s));
                }}
              />
              <Button
                label={t("discardAndMove")}
                testID="correction-discard-move"
                secondary
                disabled={
                  task.busy ||
                  pending?.state === "unknown" ||
                  Object.keys(state?.drafts ?? {}).length > 1
                }
                onPress={() => {
                  const fn = leave;
                  setLeave(null);
                  void run(async () => {
                    await store.discard(id, hole);
                    proceed.current = fn;
                  });
                }}
              />
              <Button
                label={t("keepEditing")}
                testID="correction-keep-editing"
                secondary
                onPress={() => setLeave(null)}
              />
            </Card>
          </View>
        </Modal>
      )}
    </>
  );
}
