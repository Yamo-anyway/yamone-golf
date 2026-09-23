import { useEffect, useRef, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useNavigation, usePreventRemove } from "expo-router/react-navigation";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { scores } from "../data/scores";
import { ApiError } from "../data/api";
import {
  scoreAt,
  initialHole,
  ranking,
  symbolFor,
  type ScoreSheet,
  type ScoreConflict,
  type ScoreWrite,
} from "../../shared/scores";
import { Button, Card, Txt, colors } from "./components";
import { Heading, Problem } from "./courses";
import { useLoad, useTask } from "./golf-hooks";
import { useSession } from "./session";
type Draft = {
  sheet: ScoreSheet;
  hole: number;
  rows: { slot_id: string; strokes: number; edited: boolean }[];
};
function draftFor(sheet: ScoreSheet, hole: number): Draft {
  const par = sheet.course.segments.flatMap((s) => s.pars)[hole - 1];
  return {
    sheet,
    hole,
    rows: sheet.slot_ids.map((slot_id) => ({
      slot_id,
      strokes: scoreAt(sheet, slot_id, hole).strokes ?? par,
      edited: false,
    })),
  };
}
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
  const key = "ymg:last-hole:" + profile!.user_id + ":" + id;
  const query = useLoad(async () => {
    const sheet = await scores.get(id);
    const saved = await AsyncStorage.getItem(key);
    return {
      sheet,
      resume: initialHole(sheet, saved === null ? null : Number(saved)),
    };
  });
  const task = useTask(),
    [draft, setDraft] = useState<Draft | null>(null),
    [notice, setNotice] = useState("");
  const [leave, setLeave] = useState<(() => void) | null>(null);
  const proceed = useRef<(() => void) | null>(null);
  const [seen, setSeen] = useState<typeof query.data>(null);
  const [conflict, setConflict] = useState<{
      conflicts: ScoreConflict[];
      sheet: ScoreSheet;
      write: ScoreWrite;
    } | null>(null),
    [deleting, setDeleting] = useState(false);
  const continuation = useRef<(() => void) | null>(null),
    retry = useRef<{ signature: string; id: string } | null>(null);
  const dirty = !!draft?.rows.some((r) => r.edited);
  // Adopt new server snapshots only when there is no local edit or pending confirmation.
  if (query.data && query.data !== seen && !dirty && !task.busy && !conflict) {
    setSeen(query.data);
    setDraft(draftFor(query.data.sheet, draft?.hole ?? query.data.resume));
  }
  useEffect(() => {
    if (proceed.current && !dirty && !task.busy) {
      const action = proceed.current;
      proceed.current = null;
      action();
    }
  }, [draft, dirty, task.busy]);
  usePreventRemove(phase === "ready" && (dirty || task.busy), ({ data }) =>
    setLeave(() => () => navigation.dispatch(data.action)),
  );
  useEffect(() => {
    if (Platform.OS !== "web" || (!dirty && !task.busy)) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, task.busy]);
  const latest = query.data?.sheet;
  const move = (action: () => void) => {
    if (task.busy) return;
    if (dirty) setLeave(() => action);
    else action();
  };
  const visit = (hole: number) =>
    move(() => {
      if (!latest) return;
      setDraft(draftFor(latest, hole));
      setNotice("");
      void AsyncStorage.setItem(key, String(hole)).catch(task.report);
      void query.reload();
    });
  async function save(explicit?: ScoreWrite, after?: () => void) {
    if (!draft || task.busy) return;
    continuation.current = after ?? continuation.current;
    const payload = explicit ?? {
      hole: draft.hole,
      roster_version: draft.sheet.roster_version,
      target_version: draft.sheet.target_version,
      entries: draft.rows.map((r) => ({
        slot_id: r.slot_id,
        strokes: r.strokes,
        version: scoreAt(draft.sheet, r.slot_id, draft.hole).version,
      })),
      mutation_id: "",
    };
    const signature = JSON.stringify({ ...payload, mutation_id: "" });
    if (!retry.current || retry.current.signature !== signature)
      retry.current = { signature, id: Crypto.randomUUID() };
    const write = { ...payload, mutation_id: retry.current.id };
    await task.run(async () => {
      try {
        const result = await scores.save(id, write);
        query.setData({ sheet: result.sheet, resume: draft.hole });
        setDraft(draftFor(result.sheet, draft.hole));
        setConflict(null);
        setNotice(t("holeSaved"));
        retry.current = null;
        if (continuation.current) {
          const next = continuation.current;
          proceed.current = next;
          continuation.current = null;
        }
      } catch (e) {
        if (e instanceof ApiError && e.code === "score_conflict") {
          const info = e.details as {
            conflicts: ScoreConflict[];
            sheet: ScoreSheet;
          };
          setConflict({ ...info, write });
          query.setData({ sheet: info.sheet, resume: draft.hole });
        } else {
          continuation.current = null;
          throw e;
        }
      }
    });
  }
  function discard(action?: () => void) {
    if (latest && draft) setDraft(draftFor(latest, draft.hole));
    setLeave(null);
    setConflict(null);
    setNotice("");
    continuation.current = null;
    if (action) proceed.current = action;
  }
  function rejectConflict() {
    if (!conflict || !draft) return;
    // Only conflicting rows adopt the server value. Other unsaved rows remain intact.
    const byId = new Map(conflict.conflicts.map((c) => [c.slot_id, c]));
    const updated = {
      ...draft.sheet,
      scores: [
        ...draft.sheet.scores.filter(
          (s) => !(s.hole === draft.hole && byId.has(s.slot_id)),
        ),
        ...conflict.conflicts.map((c) => ({
          slot_id: c.slot_id,
          hole: draft.hole,
          strokes: c.strokes,
          version: c.version,
        })),
      ],
    };
    const par = updated.course.segments.flatMap((s) => s.pars)[draft.hole - 1];
    setDraft({
      ...draft,
      sheet: updated,
      rows: draft.rows.map((r) => {
        const c = byId.get(r.slot_id);
        return c ? { ...r, strokes: c.strokes ?? par, edited: false } : r;
      }),
    });
    setConflict(null);
    continuation.current = null;
    setNotice(t("latestApplied"));
  }
  if (!draft)
    return (
      <>
        <Heading title={t("scoreEntry")} />
        <Problem text={query.errorText} />
        <Button label={t("retry")} onPress={() => void query.reload()} />
      </>
    );
  const { hole, sheet, rows } = draft,
    pars = sheet.course.segments.flatMap((s) => s.pars),
    half = hole > 9 ? 1 : 0;
  const existing = rows.some(
      (r) => scoreAt(sheet, r.slot_id, hole).strokes !== null,
    ),
    ended = latest?.status === "ended";
  return (
    <>
      <Heading title={t("scoreEntry")} />
      <Problem text={task.errorText || query.errorText} />
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
            <Txt style={{ color: h === hole ? "#fff" : colors.ink }}>{h}</Txt>
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
              label={t(existing ? "editHole" : "saveHole")}
              testID="save-hole"
              busy={task.busy}
              disabled={!rows.length}
              onPress={() => void save()}
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Button
                  label={t("cancel")}
                  secondary
                  disabled={task.busy || !dirty}
                  testID="cancel-hole"
                  onPress={() => setLeave(() => () => {})}
                />
              </View>
              {existing && (
                <View style={{ flex: 1 }}>
                  <Button
                    label={t("deleteHole")}
                    secondary
                    disabled={task.busy}
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
              setDraft({
                ...draft,
                rows: rows.map((x) =>
                  x.slot_id === r.slot_id
                    ? {
                        ...x,
                        strokes: Math.max(1, Math.min(999, x.strokes + delta)),
                        edited:
                          base.strokes === null ||
                          x.strokes + delta !== base.strokes,
                      }
                    : x,
                ),
              });
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
                      r.edited
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
                        {r.strokes}
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
        onPress={() => void query.reload()}
      />
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
              void save(undefined, action);
            }}
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
              void save({
                mutation_id: "",
                hole,
                roster_version: sheet.roster_version,
                target_version: sheet.target_version,
                entries: rows.map((r) => ({
                  slot_id: r.slot_id,
                  strokes: null,
                  version: scoreAt(sheet, r.slot_id, hole).version,
                })),
              });
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
            if (!task.busy) rejectConflict();
          }}
        >
          <Txt style={{ fontWeight: "800" }}>{t("scoreConflictTitle")}</Txt>
          <Txt>{t("scoreConflictHelp")}</Txt>
          {conflict.conflicts.map((c) => (
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
              const versions = new Map(
                conflict.conflicts.map((c) => [c.slot_id, c.version]),
              );
              void save({
                ...conflict.write,
                entries: conflict.write.entries.map((e) => ({
                  ...e,
                  version: versions.get(e.slot_id) ?? e.version,
                })),
              });
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
    { t } = useSession(),
    query = useLoad(() => scores.get(id)),
    sheet = query.data;
  const [hole, setHole] = useState<number | null>(null);
  return (
    <>
      <Heading title={t("scorecard")} />
      <Problem text={query.errorText} />
      {sheet && (
        <>
          <Txt>{sheet.course.name}</Txt>
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
          ))}{" "}
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
        onPress={() => void query.reload()}
      />
    </>
  );
}
