import { useCallback, useEffect, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useNavigation, usePreventRemove } from "expo-router/react-navigation";
import {
  scoreAt,
  ranking,
  symbolFor,
  type ScoreSheet,
} from "../../shared/scores";
import { Button, Card, Txt, colors } from "./components";
import { Heading, Problem } from "./courses";
import { useTask } from "./golf-hooks";
import { useSession } from "./session";
import { draftFor } from "../data/score-offline-core";
import { useOfflineScores } from "./offline-scores";
import ko from "./locales/ko";
function Dialog({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: "#0008",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <ScrollView
          style={{ maxHeight: "90%", flexGrow: 0 }}
          contentContainerStyle={{
            maxWidth: 480,
            width: "100%",
            alignSelf: "center",
          }}
        >
          <View accessibilityViewIsModal>
            <Card>{children}</Card>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
export function ScoresScreen() {
  const { height, width } = useWindowDimensions();
  const compact = height < 520 && width > height;
  const [choosingHole, setChoosingHole] = useState(false);
  const holeStrip = useRef<ScrollView>(null),
    playerScroll = useRef<ScrollView>(null);
  const { id } = useLocalSearchParams<{ id: string }>(),
    { t, profile, phase } = useSession(),
    navigation = useNavigation();
  const offline = useOfflineScores(profile!.user_id),
    { store } = offline;
  const task = useTask(),
    [notice, setNotice] = useState(""),
    [leave, setLeave] = useState<(() => void) | null>(null),
    [deleting, setDeleting] = useState(false),
    [hiddenConflict, setHiddenConflict] = useState(""),
    [reviewBlocked, setReviewBlocked] = useState(false);
  const proceed = useRef<(() => void) | null>(null),
    continuation = useRef<(() => void) | null>(null);
  const local = offline.data.rounds[id],
    hole = local?.lastHole ?? 1,
    pending = local?.queue[hole];
  const draft = local
    ? (local.drafts[hole] ?? pending?.draft ?? draftFor(local.sheet, hole))
    : null;
  const dirty =
    !!local?.drafts[hole] &&
    (!!local.drafts[hole].deleting ||
      local.drafts[hole].rows.some((r) => r.edited));
  const conflict =
    pending?.state === "conflict" &&
    pending.write.mutation_id !== hiddenConflict
      ? pending
      : null;
  const latest = local?.sheet;
  const report = task.report;
  const reload = useCallback(async () => {
    try {
      await store.refresh(id);
    } catch (e) {
      if (
        !store.snapshot().data.rounds[id] ||
        !["network"].includes((e as { code?: string }).code ?? "")
      )
        report(e);
    }
  }, [store, id, report]);
  useFocusEffect(
    useCallback(() => {
      void reload();
      return undefined;
    }, [reload]),
  );
  useEffect(() => {
    if (proceed.current && !task.busy) {
      const action = proceed.current;
      proceed.current = null;
      action();
    }
  }, [offline.data, task.busy]);
  usePreventRemove(phase === "ready" && (dirty || task.busy), ({ data }) =>
    setLeave(() => () => navigation.dispatch(data.action)),
  );
  const move = (action: () => void) => {
    if (task.busy) return;
    if (dirty) setLeave(() => action);
    else action();
  };
  const visit = (next: number) =>
    move(() => {
      void task.run(async () => {
        await store.visit(id, next);
        setNotice("");
        void reload();
      });
    });
  async function completeSend(after?: () => void) {
    await store.sync();
    const q = store.snapshot().data.rounds[id]?.queue[hole];
    if (q?.state === "conflict") {
      setHiddenConflict("");
      return;
    }
    if (q?.state === "blocked") return;
    setNotice(t(q ? "scoreQueued" : "holeSaved"));
    const action = after ?? continuation.current;
    if (action) proceed.current = action;
    continuation.current = null;
  }
  async function save(remove = false, after?: () => void) {
    continuation.current = after ?? continuation.current;
    await task.run(async () => {
      await store.enqueue(id, hole, remove);
      await completeSend(after);
    });
  }
  function discard(action?: () => void) {
    void task.run(async () => {
      await store.discard(id, hole);
      setLeave(null);
      setNotice("");
      continuation.current = null;
      if (action) proceed.current = action;
    });
  }
  function keepDraft(action: () => void) {
    void task.run(async () => {
      await store.visit(id, hole);
      setLeave(null);
      proceed.current = action;
    });
  }
  function rejectConflict() {
    void task.run(async () => {
      await store.reject(id, hole);
      continuation.current = null;
      setNotice(t("latestApplied"));
    });
  }
  useEffect(() => {
    playerScroll.current?.scrollTo({ y: 0, animated: false });
  }, [hole]);
  useEffect(() => {
    holeStrip.current?.scrollTo({
      x: Math.max(0, ((hole - 1) % 9) * 54 - (width - 96) / 2),
      animated: false,
    });
  }, [hole, compact, choosingHole, width]);
  const storeError =
    offline.error &&
    offline.error !== "network" &&
    offline.error !== "score_conflict"
      ? t(
          offline.error in ko
            ? (offline.error as keyof typeof ko)
            : "server_error",
        )
      : "";
  useEffect(() => {
    // A fixed Save action can fail while the last player is in view.
    // Bring the alert into view instead of leaving it above the viewport.
    if (task.errorText || storeError)
      playerScroll.current?.scrollTo({ y: 0, animated: false });
  }, [task.errorText, storeError]);
  if (!draft)
    return (
      <>
        <Heading title={t("scoreEntry")} />
        <Problem text={storeError} />
        <Button label={t("retry")} onPress={() => void reload()} />
      </>
    );
  const { sheet, rows } = draft,
    pars = sheet.course.segments.flatMap((s) => s.pars),
    half = hole > 9 ? 1 : 0;
  const locked = !!pending || !!local?.endRequest;
  const existing = rows.some(
      (r) => scoreAt(sheet, r.slot_id, hole).strokes !== null,
    ),
    ended = latest?.status === "ended";
  const holeButtons = Array.from(
    { length: Math.min(9, sheet.hole_count - half * 9) },
    (_, i) => half * 9 + i + 1,
  ).map((h) => (
    <Pressable
      key={h}
      testID={"hole-" + h}
      accessibilityRole="button"
      accessibilityLabel={t("hole") + " " + h}
      accessibilityState={{ selected: h === hole, disabled: task.busy }}
      disabled={task.busy}
      onPress={() => {
        setChoosingHole(false);
        visit(h);
      }}
      style={({ pressed }) => [
        scoreStyles.holeChip,
        h === hole && scoreStyles.holeChipSelected,
        { opacity: task.busy ? 0.45 : pressed ? 0.7 : 1 },
      ]}
    >
      <Txt style={{ fontWeight: "800", fontSize: 17 }}>{h}</Txt>
      {(local!.queue[h] || local!.drafts[h]) && (
        <View
          style={[
            scoreStyles.holeDot,
            { backgroundColor: local!.queue[h] ? "#A66D1C" : colors.green },
          ]}
        />
      )}
    </Pressable>
  ));
  return (
    <View style={scoreStyles.screen}>
      <View testID="score-fixed-controls" style={scoreStyles.fixedControls}>
        <Heading title={t("scoreEntry")} />
        <View style={scoreStyles.segmentBar}>
          {sheet.course.segments.map((seg, i) => (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityState={{ selected: half === i, disabled: task.busy }}
              disabled={task.busy}
              onPress={() => visit(i * 9 + 1)}
              style={({ pressed }) => [
                scoreStyles.segment,
                half === i && scoreStyles.segmentSelected,
                { opacity: task.busy ? 0.45 : pressed ? 0.7 : 1 },
              ]}
            >
              <Txt
                numberOfLines={1}
                style={{
                  fontSize: 14,
                  fontWeight: "800",
                  color: half === i ? "#fff" : colors.muted,
                }}
              >
                {t(i === 0 ? "frontNine" : "backNine")}
              </Txt>
            </Pressable>
          ))}
        </View>
        {!compact && !choosingHole && (
          <ScrollView
            ref={holeStrip}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={scoreStyles.holeStrip}
            contentContainerStyle={scoreStyles.holeStripContent}
          >
            {holeButtons}
          </ScrollView>
        )}
        <View style={scoreStyles.holeControl}>
          {[-1, 0, 1].map((delta) => {
            if (delta === 0)
              return (
                <Pressable
                  key={delta}
                  testID="choose-score-hole"
                  accessibilityRole="button"
                  accessibilityLabel={t("hole") + " " + hole}
                  onPress={() => setChoosingHole(true)}
                  disabled={task.busy}
                  style={scoreStyles.currentHole}
                >
                  <Txt testID="current-hole" style={scoreStyles.holeTitle}>
                    {t("hole")} {hole}
                    <Txt style={scoreStyles.par}> · PAR {pars[hole - 1]}</Txt>
                  </Txt>
                </Pressable>
              );
            const disabled =
              task.busy || (delta < 0 ? hole === 1 : hole === sheet.hole_count);
            return (
              <Pressable
                key={delta}
                testID={delta < 0 ? "previous-score-hole" : "next-score-hole"}
                accessibilityRole="button"
                accessibilityLabel={t(delta < 0 ? "previousHole" : "nextHole")}
                accessibilityState={{ disabled }}
                disabled={disabled}
                onPress={() => visit(hole + delta)}
                style={({ pressed }) => [
                  scoreStyles.arrow,
                  { opacity: disabled ? 0.3 : pressed ? 0.6 : 1 },
                ]}
              >
                <View
                  style={[
                    scoreStyles.chevron,
                    {
                      transform: [{ rotate: delta < 0 ? "135deg" : "-45deg" }],
                    },
                  ]}
                />
              </Pressable>
            );
          })}
        </View>
        {ended ? (
          <Txt style={scoreStyles.ended}>{t("round_ended")}</Txt>
        ) : (
          <View testID="score-fixed-actions" style={scoreStyles.actionRow}>
            <View style={{ width: 88 }}>
              <Button
                label={t("cancel")}
                secondary
                disabled={task.busy || !dirty || locked}
                testID="cancel-hole"
                onPress={() => setLeave(() => () => {})}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label={t(
                  pending
                    ? "syncNow"
                    : draft.deleting
                      ? "deleteHole"
                      : existing
                        ? "editHole"
                        : "saveHole",
                )}
                testID="save-hole"
                busy={task.busy}
                disabled={
                  !!local?.endRequest ||
                  !rows.length ||
                  (pending && pending.state !== "queued")
                }
                onPress={() => void save()}
              />
            </View>
          </View>
        )}
      </View>
      <ScrollView
        ref={playerScroll}
        testID="score-player-scroll"
        style={scoreStyles.body}
        contentContainerStyle={scoreStyles.bodyContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Problem text={task.errorText || storeError} />
        {!!notice && (
          <View
            style={[
              scoreStyles.notice,
              { backgroundColor: pending ? "#FFF3DB" : colors.mint },
            ]}
          >
            <Txt
              accessibilityLiveRegion="polite"
              testID="score-notice"
              style={{ fontSize: 14, fontWeight: "700" }}
            >
              {notice}
            </Txt>
          </View>
        )}
        <View style={scoreStyles.scope}>
          <Txt
            style={{
              flex: 1,
              fontSize: 12,
              lineHeight: 18,
              color: colors.muted,
            }}
          >
            {t("holeScope")}
          </Txt>
          <Txt style={{ fontSize: 13, fontWeight: "800" }}>{rows.length}</Txt>
        </View>
        {!rows.length && (
          <Card>
            <Txt>{t("noScoreTargets")}</Txt>
          </Card>
        )}
        {rows.map((r) => {
          const name =
              sheet.players.find((p) => p.slot_id === r.slot_id)?.name ?? "",
            base = scoreAt(sheet, r.slot_id, hole);
          const change = (delta: number) => {
            setNotice("");
            void store.change(id, hole, r.slot_id, delta).catch(task.report);
          };
          return (
            <View
              key={r.slot_id}
              testID={"score-row-" + r.slot_id}
              style={[
                scoreStyles.player,
                r.edited && { borderColor: "#C7A95F" },
              ]}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt
                  numberOfLines={2}
                  style={{ fontWeight: "800", fontSize: 16, lineHeight: 22 }}
                >
                  {name}
                </Txt>
                <Txt
                  testID={"score-state-" + r.slot_id}
                  style={{
                    fontSize: 11,
                    lineHeight: 16,
                    color: r.edited ? "#806225" : colors.muted,
                    marginTop: 5,
                  }}
                >
                  {t(
                    pending
                      ? pending.state === "queued"
                        ? "scoreQueued"
                        : "scoreHeld"
                      : r.edited
                        ? "scoreUnsaved"
                        : base.strokes === null
                          ? "scoreDefault"
                          : "scoreSaved",
                  )}
                </Txt>
              </View>
              <View style={scoreStyles.stepper}>
                {[-1, 0, 1].map((delta) => {
                  if (delta === 0)
                    return (
                      <View key={delta} style={scoreStyles.scoreNumber}>
                        <Txt
                          testID={"score-value-" + r.slot_id}
                          style={scoreStyles.strokes}
                        >
                          {draft.deleting ? "—" : r.strokes}
                        </Txt>
                        <Txt
                          style={{
                            fontSize: 10,
                            lineHeight: 13,
                            color: colors.muted,
                          }}
                        >
                          {draft.deleting
                            ? ""
                            : r.strokes === pars[hole - 1]
                              ? "PAR"
                              : `${r.strokes > pars[hole - 1] ? "+" : ""}${r.strokes - pars[hole - 1]}`}
                        </Txt>
                      </View>
                    );
                  const disabled =
                    task.busy ||
                    locked ||
                    draft.deleting ||
                    ended ||
                    r.strokes === (delta < 0 ? 1 : 999);
                  return (
                    <Pressable
                      key={delta}
                      accessibilityRole="button"
                      accessibilityLabel={
                        name +
                        " " +
                        t(delta < 0 ? "decreaseScore" : "increaseScore")
                      }
                      accessibilityState={{ disabled: !!disabled }}
                      testID={(delta < 0 ? "minus-" : "plus-") + r.slot_id}
                      disabled={disabled}
                      onPress={() => change(delta)}
                      style={({ pressed }) => [
                        scoreStyles.step,
                        delta > 0 && scoreStyles.stepPlus,
                        { opacity: disabled ? 0.35 : pressed ? 0.65 : 1 },
                      ]}
                    >
                      <Txt
                        style={{
                          fontSize: 25,
                          lineHeight: 30,
                          color: delta > 0 ? "#fff" : colors.ink,
                        }}
                      >
                        {delta < 0 ? "−" : "+"}
                      </Txt>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}
        {existing && !ended && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("deleteHole")}
            accessibilityState={{ disabled: task.busy || locked }}
            disabled={task.busy || locked}
            testID="delete-hole"
            onPress={() => setDeleting(true)}
            style={({ pressed }) => [
              scoreStyles.deleteAction,
              { opacity: task.busy || locked ? 0.35 : pressed ? 0.6 : 1 },
            ]}
          >
            <Txt style={{ color: colors.error, fontSize: 13 }}>
              {t("deleteHole")} · {t("hole")} {hole}
            </Txt>
          </Pressable>
        )}
        {pending?.state === "conflict" && (
          <Button
            label={t("reviewScoreConflict")}
            testID="review-score-conflict"
            onPress={() => setHiddenConflict("")}
          />
        )}
        {pending?.state === "blocked" && (
          <Card>
            <Txt style={{ fontWeight: "700" }}>{t("scoreHeld")}</Txt>
            <Txt>
              {t(
                pending.error === "round_ended"
                  ? "endedOfflineHold"
                  : "blockedOfflineHold",
              )}
            </Txt>
            <Problem
              text={t(
                pending.error && pending.error in ko
                  ? (pending.error as keyof typeof ko)
                  : "state_changed",
              )}
            />
            {pending.write.entries.map((e) => (
              <Txt selectable key={e.slot_id}>
                {
                  pending.draft.sheet.players.find(
                    (p) => p.slot_id === e.slot_id,
                  )?.name
                }
                : {e.strokes ?? t("notEntered")}
              </Txt>
            ))}
            {["targets_changed", "state_changed"].includes(
              pending.error ?? "",
            ) && (
              <Button
                label={t("reprepareScores")}
                onPress={() => {
                  void task.run(async () => {
                    await store.refresh(id);
                    setReviewBlocked(true);
                  });
                }}
              />
            )}
          </Card>
        )}
        {reviewBlocked && pending && (
          <Dialog onClose={() => setReviewBlocked(false)}>
            <Txt>{t("reprepareHelp")}</Txt>
            {pending.write.entries.every((e) => e.strokes === null) && (
              <Txt>{t("reprepareDeleteHelp")}</Txt>
            )}
            <Txt>
              {latest?.slot_ids
                .map((id) => latest.players.find((p) => p.slot_id === id)?.name)
                .join(", ")}
            </Txt>
            <Txt>
              {t("excludedDraftPlayers")}:{" "}
              {pending.draft.rows
                .filter((r) => !latest?.slot_ids.includes(r.slot_id))
                .map(
                  (r) =>
                    pending.draft.sheet.players.find(
                      (p) => p.slot_id === r.slot_id,
                    )?.name,
                )
                .join(", ") || "—"}
            </Txt>
            <Button
              label={t("reprepareScores")}
              onPress={() =>
                void task.run(async () => {
                  await store.reprepare(id, hole);
                  setReviewBlocked(false);
                })
              }
            />
            <Button
              label={t("cancel")}
              secondary
              onPress={() => setReviewBlocked(false)}
            />
          </Dialog>
        )}
        <Button
          label={t(
            local?.endRequest
              ? "retryEnd"
              : ended
                ? "roundEndedTitle"
                : "endRound",
          )}
          secondary
          testID="scores-end-round"
          disabled={task.busy}
          onPress={() =>
            move(() =>
              router.push({ pathname: "/round-ending", params: { id } }),
            )
          }
        />
        {local?.endRequest && <Txt>{t("end_pending")}</Txt>}
        <Button
          label={t("scorecard")}
          secondary
          testID="open-scorecard"
          disabled={task.busy}
          onPress={() =>
            move(() => router.push({ pathname: "/scorecard", params: { id } }))
          }
        />
        <Button
          label={t("inputTargets")}
          secondary
          disabled={task.busy}
          onPress={() =>
            move(() =>
              router.push({ pathname: "/input-targets", params: { id } }),
            )
          }
        />
        <Button
          label={t("refresh")}
          secondary
          testID="refresh-scores"
          disabled={task.busy}
          onPress={() => void reload()}
        />
        <Card>
          <Txt
            testID="offline-score-summary"
            style={{ fontSize: 12, fontWeight: "700" }}
          >
            {t("localDrafts")} {Object.keys(local!.drafts).length} ·{" "}
            {t("pendingHoles")} {Object.keys(local!.queue).length}
          </Txt>
          <Txt style={{ fontSize: 12, color: colors.muted }}>
            {t(offline.syncing ? "syncingScores" : "offlineScoreHelp")}
          </Txt>
          {Object.keys(local!.drafts).length > 0 && (
            <Txt testID="draft-holes" style={{ fontSize: 12 }}>
              {t("draftHoles")}: {Object.keys(local!.drafts).join(", ")}
            </Txt>
          )}
          {Object.keys(local!.queue).length > 0 && (
            <Txt testID="queued-holes" style={{ fontSize: 12 }}>
              {t("queuedHoles")}: {Object.keys(local!.queue).join(", ")}
            </Txt>
          )}
        </Card>
        <Txt style={{ fontSize: 13, color: colors.muted }}>
          {t("scoreRefreshHelp")}
        </Txt>
      </ScrollView>
      {choosingHole && (
        <Dialog onClose={() => setChoosingHole(false)}>
          <Txt style={{ fontSize: 20, fontWeight: "800" }}>{t("hole")}</Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {holeButtons}
          </View>
          <Button
            label={t("cancel")}
            secondary
            onPress={() => setChoosingHole(false)}
          />
        </Dialog>
      )}
      {leave && !conflict && (
        <Dialog onClose={() => setLeave(null)}>
          <Txt style={{ fontWeight: "800" }}>{t("scoreLeaveTitle")}</Txt>
          <Txt>{t("scoreLeaveHelp")}</Txt>
          <Button
            label={t("saveAndMove")}
            testID="save-and-move"
            disabled={task.busy || ended}
            onPress={() => {
              const action = leave;
              setLeave(null);
              void save(false, action);
            }}
          />
          <Button
            label={t("keepDraftAndMove")}
            testID="keep-draft-and-move"
            secondary
            disabled={task.busy}
            onPress={() => keepDraft(leave)}
          />
          <Button
            label={t("discardAndMove")}
            testID="discard-and-move"
            secondary
            disabled={task.busy}
            onPress={() => discard(leave)}
          />
          <Button
            label={t("keepEditing")}
            testID="keep-score-editing"
            secondary
            onPress={() => setLeave(null)}
          />
        </Dialog>
      )}
      {deleting && (
        <Dialog onClose={() => setDeleting(false)}>
          <Txt style={{ fontSize: 20, fontWeight: "800" }}>
            {t("hole")} {hole} · {t("deleteHole")}
          </Txt>
          <Txt>{t("deleteHoleHelp")}</Txt>
          <Txt>
            {rows
              .map(
                (r) => sheet.players.find((p) => p.slot_id === r.slot_id)?.name,
              )
              .join(", ")}
          </Txt>
          <Button
            label={t("deleteHole")}
            testID="confirm-delete-hole"
            onPress={() => {
              setDeleting(false);
              void save(true);
            }}
          />
          <Button
            label={t("cancel")}
            secondary
            onPress={() => setDeleting(false)}
          />
        </Dialog>
      )}
      {conflict && (
        <Dialog
          onClose={() => {
            if (!task.busy) setHiddenConflict(conflict!.write.mutation_id);
          }}
        >
          <Txt style={{ fontWeight: "800" }}>{t("scoreConflictTitle")}</Txt>
          <Txt>{t("scoreConflictHelp")}</Txt>
          {conflict.conflicts!.map((c) => (
            <Txt key={c.slot_id}>
              {sheet.players.find((p) => p.slot_id === c.slot_id)?.name}:{" "}
              {c.strokes ?? t("notEntered")} → {c.proposed ?? t("notEntered")}
            </Txt>
          ))}
          <Problem text={task.errorText} />
          <Button
            label={t("overwriteScores")}
            testID="confirm-score-conflict"
            busy={task.busy}
            onPress={() => {
              void task.run(async () => {
                await store.confirm(id, hole);
                await completeSend();
              });
            }}
          />
          <Button
            label={t("reviewLater")}
            testID="defer-score-conflict"
            secondary
            disabled={task.busy}
            onPress={() => {
              continuation.current = null;
              setHiddenConflict(conflict.write.mutation_id);
            }}
          />
          <Button
            label={t("useLatestScores")}
            testID="reject-score-conflict"
            secondary
            disabled={task.busy}
            onPress={rejectConflict}
          />
        </Dialog>
      )}
    </View>
  );
}
function ScoreMark({ strokes, par }: { strokes: number | null; par: number }) {
  const symbol = symbolFor(strokes, par),
    color =
      symbol === "birdie"
        ? "#AE483C"
        : symbol === "bogey" || symbol === "double"
          ? "#3B637D"
          : colors.ink;
  return (
    <View
      style={{
        width: 21,
        height: 25,
        alignItems: "center",
        justifyContent: "center",
        borderWidth:
          symbol === "birdie" || symbol === "bogey" || symbol === "double"
            ? 1
            : 0,
        borderColor: color,
        borderRadius: symbol === "birdie" ? 14 : 0,
      }}
    >
      {symbol === "double" && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 2,
            bottom: 2,
            left: 2,
            right: 2,
            borderWidth: 1,
            borderColor: color,
          }}
        />
      )}
      <Txt style={{ fontSize: 11, lineHeight: 17, color }}>
        {strokes ?? "—"}
      </Txt>
    </View>
  );
}
export function ScorecardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    { t, profile } = useSession(),
    offline = useOfflineScores(profile!.user_id),
    { store } = offline;
  const sheet = offline.data.rounds[id]?.sheet;
  const storeError =
    offline.error && offline.error !== "network"
      ? t(
          offline.error in ko
            ? (offline.error as keyof typeof ko)
            : "server_error",
        )
      : "";
  const reload = useCallback(async () => {
    try {
      await store.refresh(id);
    } catch {
      /* Cached server records remain available. */
    }
  }, [store, id]);
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
  return (
    <>
      <Heading title={t("scorecard")} />
      <Problem text={storeError} />
      {sheet && (
        <>
          <Txt style={{ fontSize: 12, color: colors.muted }}>
            {t("cachedScorecardHelp")}
          </Txt>
          <ScorecardContent sheet={sheet} />
        </>
      )}
      <Button
        label={t("refresh")}
        testID="refresh-scorecard"
        secondary
        onPress={() => void reload()}
      />
    </>
  );
}

export function ScorecardContent({ sheet }: { sheet: ScoreSheet }) {
  const { t } = useSession();
  const [hole, setHole] = useState<number | null>(null);
  return (
    <>
      <Txt style={{ fontSize: 20, lineHeight: 28, fontWeight: "800" }}>
        {sheet.course.name}
      </Txt>

      {sheet.course.segments.map((segment, half) => (
        <View
          key={half}
          testID={"card-half-" + half}
          style={{
            gap: 12,
            padding: 12,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: 18,
            backgroundColor: "#fff",
          }}
        >
          <Txt style={{ fontWeight: "800" }}>
            {t(half === 0 ? "frontNine" : "backNine")} · {segment.name}
          </Txt>
          <View
            style={{
              flexDirection: "row",
              backgroundColor: colors.mint,
              paddingVertical: 8,
              borderRadius: 10,
            }}
          >
            {segment.pars.map((par, i) => (
              <View key={i} style={{ flex: 1, alignItems: "center" }}>
                <Txt style={{ fontSize: 11, lineHeight: 18 }}>
                  {half * 9 + i + 1}
                </Txt>
                <Txt
                  style={{
                    fontSize: 10,
                    lineHeight: 16,
                    color: colors.muted,
                  }}
                >
                  P{par}
                </Txt>
              </View>
            ))}
            <View style={{ width: 34, alignItems: "center" }}>
              <Txt style={{ fontSize: 10, lineHeight: 18 }}>{t("total")}</Txt>
              <Txt style={{ fontSize: 10, lineHeight: 16 }}>
                {segment.pars.reduce((a, b) => a + b, 0)}
              </Txt>
            </View>
          </View>
          {ranking(sheet).map((p) => {
            const values = segment.pars.map(
                (_, i) => scoreAt(sheet, p.slot_id, half * 9 + i + 1).strokes,
              ),
              count = values.filter((v) => v !== null).length;
            return (
              <View key={p.slot_id} style={{ gap: 4 }}>
                <Txt style={{ fontSize: 14, fontWeight: "600" }}>
                  {p.rank ?? "—"}. {p.name}{" "}
                  <Txt style={{ fontSize: 12, color: colors.muted }}>
                    ({count}/9)
                  </Txt>
                </Txt>
                <View style={{ flexDirection: "row" }}>
                  {values.map((v, i) => (
                    <View key={i} style={{ flex: 1, alignItems: "center" }}>
                      <ScoreMark strokes={v} par={segment.pars[i]} />
                    </View>
                  ))}
                  <View
                    style={{
                      width: 34,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Txt style={{ fontSize: 12, fontWeight: "800" }}>
                      {count
                        ? values.reduce<number>((s, v) => s + (v ?? 0), 0)
                        : "—"}
                    </Txt>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      ))}
      <Txt style={{ color: colors.muted, fontSize: 13 }}>
        {t("scoreLegend")}
      </Txt>
      <Card>
        <Txt style={{ fontWeight: "800" }}>
          {t(hole === null ? "cumulativeRank" : "holeRank")}
          {hole === null ? "" : " · " + hole}
        </Txt>
        <Txt style={{ fontSize: 13, color: colors.muted }}>{t("rankHelp")}</Txt>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setHole(null)}
            style={{
              padding: 10,
              backgroundColor: hole === null ? colors.mint : undefined,
            }}
          >
            <Txt>{t("total")}</Txt>
          </Pressable>
          {Array.from({ length: sheet.hole_count }, (_, i) => i + 1).map(
            (h) => (
              <Pressable
                key={h}
                accessibilityRole="button"
                onPress={() => setHole(h)}
                style={{
                  minWidth: 48,
                  minHeight: 48,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: hole === h ? colors.mint : undefined,
                }}
              >
                <Txt>{h}</Txt>
              </Pressable>
            ),
          )}
        </View>
        {ranking(sheet, hole ?? undefined).map((p) => (
          <View key={p.slot_id} style={{ flexDirection: "row", gap: 8 }}>
            <Txt style={{ width: 24 }}>{p.rank ?? "—"}</Txt>
            <Txt style={{ flex: 1 }}>{p.name}</Txt>
            <Txt>
              {p.total ?? "—"} · {p.count}/
              {hole === null ? sheet.hole_count : 1}
            </Txt>
          </View>
        ))}
      </Card>
    </>
  );
}

const scoreStyles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0 },
  fixedControls: {
    flexShrink: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  segmentBar: {
    flexDirection: "row",
    gap: 4,
    backgroundColor: "#E8ECE5",
    borderRadius: 14,
    padding: 3,
  },
  segment: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    paddingHorizontal: 8,
  },
  segmentSelected: { backgroundColor: "#174E3F" },
  holeStrip: { flexGrow: 0, flexShrink: 0 },
  holeStripContent: { gap: 6, paddingVertical: 2 },
  holeChip: {
    width: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "#fff",
  },
  holeChipSelected: { backgroundColor: "#DAEE94", borderColor: "#C6DD78" },
  holeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    position: "absolute",
    bottom: 5,
  },
  holeControl: { flexDirection: "row", alignItems: "center", gap: 8 },
  arrow: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.line,
  },
  chevron: {
    width: 10,
    height: 10,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderColor: "#174E3F",
  },
  currentHole: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  holeTitle: { fontSize: 23, lineHeight: 32, fontWeight: "800" },
  par: { fontSize: 14, lineHeight: 24, color: colors.muted, fontWeight: "700" },
  actionRow: { flexDirection: "row", gap: 8, alignItems: "stretch" },
  ended: {
    minHeight: 48,
    paddingVertical: 12,
    textAlign: "center",
    color: colors.muted,
  },
  body: { flex: 1, minHeight: 0 },
  bodyContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 12,
  },
  notice: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  scope: { flexDirection: "row", alignItems: "center", gap: 10 },
  player: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 96,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "#fff",
    borderRadius: 18,
  },
  stepper: { flexDirection: "row", alignItems: "center", gap: 4 },
  step: {
    width: 48,
    height: 48,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "#F5F6F2",
    alignItems: "center",
    justifyContent: "center",
  },
  stepPlus: { backgroundColor: "#174E3F", borderColor: "#174E3F" },
  scoreNumber: { minWidth: 42, alignItems: "center", justifyContent: "center" },
  strokes: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  deleteAction: {
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  },
});
