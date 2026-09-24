import { useState } from "react";
import { useRecordBanner } from "./banner-context";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { PeoriaHistory } from "../../shared/peoria";
import { peoria, peoriaFlow } from "../data/peoria";
import { useSession } from "./session";
import { useLoad, useTask } from "./golf-hooks";
import { Heading, Problem } from "./courses";
import { Button, Card, Txt, colors } from "./components";
import { ScorecardContent } from "./scores";
export function PeoriaEntry({
  id,
  origin = "round",
}: {
  id: string;
  origin?: "round" | "record";
}) {
  const { t } = useSession();
  return (
    <Button
      label={t("peoriaTitle")}
      secondary
      testID="open-peoria"
      onPress={() =>
        router.push({ pathname: "/peoria", params: { id, origin } })
      }
    />
  );
}
export function PeoriaScreen() {
  const { id, origin } = useLocalSearchParams<{
    id: string;
    origin?: string;
  }>();
  const { profile, t, lang } = useSession(),
    task = useTask(),
    flow = peoriaFlow(profile!.user_id);
  const query = useLoad(() => peoria.history(id)),
    pendingQuery = useLoad(async () => ({ pending: await flow.read() }));
  const [confirmation, setConfirmation] = useState<PeoriaHistory | null>(null),
    [selected, setSelected] = useState<string | null>(null),
    [showSnapshot, setShowSnapshot] = useState(false),
    [saved, setSaved] = useState(false),
    [showRules, setShowRules] = useState(false);
  const h = query.error === "forbidden" ? null : query.data,
    pending = pendingQuery.data?.pending;
  const run = h?.runs.find((r) => r.run_id === selected) ?? h?.runs[0];
  useRecordBanner(
    "peoria",
    origin === "record" && !!h && !query.error && !confirmation && !task.busy,
  );
  const busy = task.busy;
  const date = (at: number) =>
    new Date(at).toLocaleString(lang === "ko" ? "ko-KR" : "en-US");
  const num = (v: number) =>
    v.toLocaleString(lang === "ko" ? "ko-KR" : "en-US", {
      maximumFractionDigits: 1,
    });
  async function refresh() {
    await Promise.all([query.reload(), pendingQuery.reload()]);
  }
  async function prepare() {
    setSaved(false);
    setConfirmation(null);
    await task.run(async () => {
      const fresh = await peoria.history(id);
      query.setData(fresh);
      if (!fresh.calculation.available)
        throw { code: fresh.calculation.reason };
      setConfirmation(fresh);
    });
  }
  async function execute(retry = false) {
    await task.run(async () => {
      try {
        const ack = retry
          ? await flow.retry(peoria.execute)
          : await flow.start(
              id,
              {
                record_version: confirmation!.record_version,
                expected_runs: confirmation!.runs.length,
                confirmation_token:
                  confirmation!.calculation.confirmation_token,
                exclude_incomplete:
                  confirmation!.calculation.excluded.length > 0,
                confirm_recalculation: confirmation!.runs.length > 0,
              },
              peoria.execute,
            );
        setSelected(ack.run_id);
        setShowSnapshot(false);
        setSaved(true);
      } finally {
        setConfirmation(null);
        await refresh();
      }
    });
  }
  return (
    <View
      style={{ gap: 18 }}
      testID={origin === "record" ? "peoria-record-flow" : "peoria-round-flow"}
    >
      <Heading title={t("peoriaTitle")} />
      <Problem
        text={task.errorText || query.errorText || pendingQuery.errorText}
      />
      {saved && <Txt testID="peoria-saved">{t("peoriaSaved")}</Txt>}
      {pending && (
        <Card>
          <Txt testID="peoria-pending">
            {t(pending.rejected ? "peoriaRejected" : "peoriaPending")}
          </Txt>
          {pending.round_id !== id ? (
            <Button
              label={t("resumePeoria")}
              disabled={busy}
              onPress={() =>
                router.replace({
                  pathname: "/peoria",
                  params: { id: pending.round_id, origin: "round" },
                })
              }
            />
          ) : pending.rejected ? (
            <Button
              label={t("peoriaCheckAgain")}
              testID="peoria-clear-rejected"
              disabled={busy}
              onPress={() =>
                void task.run(async () => {
                  await flow.clearRejected(pending.write.request_id);
                  await refresh();
                  setSaved(false);
                })
              }
            />
          ) : (
            <Button
              label={t("peoriaRetry")}
              testID="peoria-retry"
              busy={busy}
              onPress={() => void execute(true)}
            />
          )}
        </Card>
      )}
      {h && (
        <>
          <Txt testID="peoria-count">
            {t("peoriaCount")} · {h.runs.length}/3
          </Txt>
          <Txt>
            {t("peoriaDeadline")} · {date(h.calculation.deadline)}
          </Txt>
          {!h.calculation.available && (
            <Txt testID="peoria-locked">
              {t(
                h.calculation.reason === "available"
                  ? "peoria_expired"
                  : h.calculation.reason,
              )}
            </Txt>
          )}
          {h.calculation.available && !confirmation && (
            <Button
              label={t(h.runs.length ? "peoriaRecalculate" : "peoriaCalculate")}
              testID="peoria-prepare"
              disabled={busy || !pendingQuery.data || !!pending}
              onPress={() => void prepare()}
            />
          )}
          {confirmation && (
            <Card>
              <Txt style={{ fontSize: 22, fontWeight: "800" }}>
                {t(
                  confirmation.runs.length
                    ? "peoriaRecalculateConfirm"
                    : "peoriaCalculateConfirm",
                )}
              </Txt>
              <Txt>
                {t("peoriaTargetPlayers")} ·{" "}
                {confirmation.calculation.targets.length}
              </Txt>
              {confirmation.calculation.targets.map((p) => (
                <Txt key={p.slot_id}>{p.name} · 18/18</Txt>
              ))}
              {!!confirmation.calculation.excluded.length && (
                <>
                  <Txt style={{ fontWeight: "700" }}>
                    {t("peoriaExcludeConfirm")}
                  </Txt>
                  {confirmation.calculation.excluded.map((p) => (
                    <Txt key={p.slot_id}>
                      {p.name} · {p.holes_recorded}/18
                    </Txt>
                  ))}
                </>
              )}
              <Txt>
                {t(
                  confirmation.runs.length
                    ? "peoriaRecalculateWarning"
                    : "peoriaFirstWarning",
                )}
              </Txt>
              <Txt style={{ color: colors.muted }}>{t("peoriaProfile")}</Txt>
              <Button
                label={t(
                  confirmation.calculation.excluded.length
                    ? "peoriaExcludeAndCalculate"
                    : confirmation.runs.length
                      ? "peoriaRecalculate"
                      : "peoriaCalculate",
                )}
                testID="peoria-confirm"
                busy={busy}
                onPress={() => void execute()}
              />
              <Button
                label={t("cancel")}
                secondary
                disabled={busy}
                onPress={() => setConfirmation(null)}
              />
            </Card>
          )}
          {!run && <Txt testID="peoria-empty">{t("peoriaEmpty")}</Txt>}
          {run && (
            <>
              <Card>
                <Txt
                  style={{ fontSize: 22, fontWeight: "800" }}
                  testID="peoria-selected"
                >
                  {t("peoriaResult")} {run.ordinal}
                  {run.run_id === h.latest_run_id
                    ? " · " + t("peoriaLatest")
                    : ""}
                </Txt>
                <Txt>{run.snapshot.course_name}</Txt>
                <Txt>
                  {date(run.calculated_at)} · {run.actor_name}
                </Txt>
                {run.source_record_version !== h.record_version && (
                  <Txt testID="peoria-stale">{t("peoriaStale")}</Txt>
                )}
                {run.results.map((row) => (
                  <View
                    key={row.slot_id}
                    testID={"peoria-result-" + row.slot_id}
                    style={{
                      paddingVertical: 10,
                      borderTopWidth: 1,
                      borderColor: colors.line,
                      gap: 6,
                    }}
                  >
                    <Txt style={{ fontWeight: "800" }}>
                      {row.rank} ·{" "}
                      {
                        run.snapshot.players.find(
                          (p) => p.slot_id === row.slot_id,
                        )?.name
                      }
                    </Txt>
                    <View
                      style={{
                        flexDirection: "row",
                        gap: 18,
                        flexWrap: "wrap",
                      }}
                    >
                      {[
                        ["peoriaGross", row.gross],
                        ["peoriaHandicap", row.handicap],
                        ["peoriaNet", row.net],
                      ].map(([key, value]) => (
                        <View key={String(key)}>
                          <Txt style={{ fontSize: 12, color: colors.muted }}>
                            {t(key as "peoriaGross")}
                          </Txt>
                          <Txt
                            style={{
                              fontSize: 24,
                              fontWeight: "700",
                              lineHeight: 30,
                            }}
                          >
                            {num(Number(value))}
                          </Txt>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
                {!!run.excluded_slot_ids.length && (
                  <Txt>
                    {t("peoriaExcluded")} ·{" "}
                    {run.snapshot.players
                      .filter((p) => run.excluded_slot_ids.includes(p.slot_id))
                      .map((p) => p.name)
                      .join(", ")}
                  </Txt>
                )}
              </Card>
              <Txt>{t("peoriaHistoryTitle")}</Txt>
              {h.runs.map((r) => (
                <Button
                  key={r.run_id}
                  label={`${t("peoriaResult")} ${r.ordinal} · ${date(r.calculated_at)} · ${r.actor_name}`}
                  testID={"peoria-run-" + r.ordinal}
                  secondary={r.run_id !== run.run_id}
                  onPress={() => {
                    setSelected(r.run_id);
                    setShowSnapshot(false);
                  }}
                />
              ))}
              <Button
                label={t(
                  showSnapshot ? "peoriaHideSnapshot" : "peoriaShowSnapshot",
                )}
                testID="peoria-snapshot-toggle"
                secondary
                onPress={() => setShowSnapshot(!showSnapshot)}
              />
              {showSnapshot && (
                <ScorecardContent
                  sheet={{
                    round_id: id,
                    status: "ended",
                    hole_count: 18,
                    course: {
                      name: run.snapshot.course_name,
                      segments: [
                        {
                          name: t("frontNine"),
                          pars: run.snapshot.pars.slice(0, 9),
                        },
                        {
                          name: t("backNine"),
                          pars: run.snapshot.pars.slice(9),
                        },
                      ],
                    },
                    roster_version: 0,
                    target_version: 0,
                    slot_ids: [],
                    players: run.snapshot.players.map((p, i) => ({
                      slot_id: p.slot_id,
                      name: p.name,
                      position: i,
                    })),
                    scores: run.snapshot.players.flatMap((p) =>
                      p.scores.map((strokes, i) => ({
                        slot_id: p.slot_id,
                        hole: i + 1,
                        strokes,
                        version: 0,
                      })),
                    ),
                  }}
                />
              )}
            </>
          )}
          <Button
            label={t("peoriaRules")}
            secondary
            onPress={() => setShowRules(!showRules)}
          />
          {showRules && (
            <Card>
              <Txt>{t("peoriaProfile")}</Txt>
              <Txt>{t("peoriaFormula")}</Txt>
              <Txt>{t("peoriaHiddenHelp")}</Txt>
            </Card>
          )}
        </>
      )}
      <Button
        label={t("refresh")}
        secondary
        testID="refresh-peoria"
        disabled={busy}
        onPress={() => void refresh()}
      />
    </View>
  );
}
