import { useCallback, useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useNavigation, usePreventRemove } from "expo-router/react-navigation";
import { scoreAt, ranking, symbolFor } from "../../shared/scores";
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
  return (
    <>
      <Heading title={t("scoreEntry")} />
      <Problem text={task.errorText || storeError} />
      <View
        style={{
          gap: 6,
          padding: 12,
          backgroundColor: colors.mint,
          borderRadius: 12,
        }}
      >
        <Txt testID="offline-score-summary" style={{ fontSize: 13 }}>
          {t("localDrafts")} {Object.keys(local!.drafts).length} ·{" "}
          {t("pendingHoles")} {Object.keys(local!.queue).length}
        </Txt>
        {offline.syncing && (
          <Txt style={{ fontSize: 12, color: colors.muted }}>
            {t("syncingScores")}
          </Txt>
        )}
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {sheet.course.segments.map((seg, i) => (
          <View key={i} style={{ flex: 1 }}>
            <Button
              label={t(i === 0 ? "frontNine" : "backNine")}
              secondary={half !== i}
              disabled={task.busy}
              onPress={() => visit(i * 9 + 1)}
            />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {Array.from({ length: 9 }, (_, i) => half * 9 + i + 1).map((h) => (
          <Pressable
            key={h}
            testID={"hole-" + h}
            accessibilityRole="button"
            accessibilityLabel={t("hole") + " " + h}
            accessibilityState={{ selected: h === hole }}
            disabled={task.busy}
            onPress={() => visit(h)}
            style={{
              minWidth: 44,
              minHeight: 44,
              borderRadius: 10,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: h === hole ? colors.green : "#fff",
              borderColor: colors.line,
              borderWidth: 1,
            }}
          >
            <Txt style={{ color: h === hole ? "#fff" : colors.ink }}>
              {h}
              {local!.queue[h] ? " ◦" : local!.drafts[h] ? " ·" : ""}
            </Txt>
          </Pressable>
        ))}
      </View>
      <View style={{ gap: 10 }}>
        <Txt
          testID="current-hole"
          style={{ fontSize: 24, lineHeight: 32, fontWeight: "800" }}
        >
          {t("hole")} {hole} · PAR {pars[hole - 1]}
        </Txt>
        <Txt style={{ color: colors.muted, fontSize: 14 }}>
          {t("holeScope")} · {rows.length}
        </Txt>
        {ended ? (
          <Txt>{t("round_ended")}</Txt>
        ) : (
          <>
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
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Button
                  label={t("cancel")}
                  secondary
                  disabled={task.busy || !dirty || locked}
                  testID="cancel-hole"
                  onPress={() => setLeave(() => () => {})}
                />
              </View>
              {existing && (
                <View style={{ flex: 1 }}>
                  <Button
                    label={t("deleteHole")}
                    secondary
                    disabled={task.busy || locked}
                    testID="delete-hole"
                    onPress={() => setDeleting(true)}
                  />
                </View>
              )}
            </View>
          </>
        )}
        {notice && (
          <Txt accessibilityLiveRegion="polite" testID="score-notice">
            {notice}
          </Txt>
        )}
        {!rows.length && <Txt>{t("noScoreTargets")}</Txt>}
        <View style={{ borderTopWidth: 1, borderColor: colors.line }}>
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
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingVertical: 10,
                  borderBottomWidth: 1,
                  borderColor: colors.line,
                }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt numberOfLines={2} style={{ fontWeight: "700" }}>
                    {name}
                  </Txt>
                  <Txt
                    testID={"score-state-" + r.slot_id}
                    style={{
                      fontSize: 12,
                      lineHeight: 18,
                      color: r.edited ? "#806225" : colors.muted,
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
                {[-1, 1].map((delta, i) => (
                  <View
                    key={delta}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    {i === 1 && (
                      <Txt
                        testID={"score-value-" + r.slot_id}
                        style={{
                          fontSize: 23,
                          lineHeight: 30,
                          minWidth: 32,
                          textAlign: "center",
                        }}
                      >
                        {draft.deleting ? "—" : r.strokes}
                      </Txt>
                    )}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        name +
                        " " +
                        t(delta < 0 ? "decreaseScore" : "increaseScore")
                      }
                      testID={(delta < 0 ? "minus-" : "plus-") + r.slot_id}
                      disabled={
                        task.busy ||
                        locked ||
                        draft.deleting ||
                        ended ||
                        r.strokes === (delta < 0 ? 1 : 999)
                      }
                      onPress={() => change(delta)}
                      style={{
                        width: 44,
                        height: 44,
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 10,
                        backgroundColor: "#fff",
                        borderWidth: 1,
                        borderColor: colors.line,
                      }}
                    >
                      <Txt style={{ fontSize: 24 }}>
                        {delta < 0 ? "−" : "+"}
                      </Txt>
                    </Pressable>
                  </View>
                ))}
              </View>
            );
          })}
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button
            label={t("previousHole")}
            secondary
            disabled={hole === 1 || task.busy}
            onPress={() => visit(hole - 1)}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label={t("nextHole")}
            secondary
            disabled={hole === sheet.hole_count || task.busy}
            onPress={() => visit(hole + 1)}
          />
        </View>
      </View>
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
                pending.draft.sheet.players.find((p) => p.slot_id === e.slot_id)
                  ?.name
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
          move(() => router.push({ pathname: "/round-ending", params: { id } }))
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
    </>
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
  const [hole, setHole] = useState<number | null>(null);
  return (
    <>
      <Heading title={t("scorecard")} />
      <Problem text={storeError} />
      {sheet && (
        <>
          <Txt>{sheet.course.name}</Txt>
          <Txt style={{ fontSize: 12, color: colors.muted }}>
            {t("cachedScorecardHelp")}
          </Txt>
          {sheet.course.segments.map((segment, half) => (
            <View
              key={half}
              testID={"card-half-" + half}
              style={{
                gap: 10,
                paddingVertical: 16,
                borderTopWidth: 1,
                borderColor: colors.line,
              }}
            >
              <Txt style={{ fontWeight: "800" }}>
                {t(half === 0 ? "frontNine" : "backNine")} · {segment.name}
              </Txt>
              <View style={{ flexDirection: "row" }}>
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
                  <Txt style={{ fontSize: 10, lineHeight: 18 }}>
                    {t("total")}
                  </Txt>
                  <Txt style={{ fontSize: 10, lineHeight: 16 }}>
                    {segment.pars.reduce((a, b) => a + b, 0)}
                  </Txt>
                </View>
              </View>
              {ranking(sheet).map((p) => {
                const values = segment.pars.map(
                    (_, i) =>
                      scoreAt(sheet, p.slot_id, half * 9 + i + 1).strokes,
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
            <Txt style={{ fontSize: 13, color: colors.muted }}>
              {t("rankHelp")}
            </Txt>
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
                      minWidth: 44,
                      minHeight: 44,
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
