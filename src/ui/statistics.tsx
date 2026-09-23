import { router } from "expo-router";
import { View } from "react-native";
import { getStatistics } from "../data/corrections";
import { useSession } from "./session";
import { useLoad } from "./golf-hooks";
import { Heading, Problem } from "./courses";
import { Button, Card, Txt, colors } from "./components";
export function StatisticsScreen() {
  const { t, lang } = useSession(),
    query = useLoad(getStatistics),
    s = query.data;
  const n = (value: number | null) =>
    value === null
      ? "—"
      : value.toLocaleString(lang === "ko" ? "ko-KR" : "en-US", {
          maximumFractionDigits: 1,
        });
  return (
    <>
      <Heading title={t("statisticsTitle")} />
      <Txt>{t("statisticsHelp")}</Txt>
      <Problem text={query.errorText} />
      {s && (
        <>
          <Card>
            <Txt
              style={{ fontSize: 22, fontWeight: "800" }}
              testID="eligible-rounds"
            >
              {t("eligibleRounds")} · {s.eligible_rounds}
            </Txt>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 20 }}>
              {(
                [
                  ["averageScore", s.average_strokes],
                  ["bestScore", s.best_strokes],
                  ["highestScore", s.highest_strokes],
                  ["averageToPar", s.average_to_par],
                ] as const
              ).map(([key, value]) => (
                <View key={key} style={{ minWidth: 100, flexGrow: 1 }}>
                  <Txt style={{ fontSize: 13, color: colors.muted }}>
                    {t(key)}
                  </Txt>
                  <Txt
                    testID={"stat-" + key}
                    style={{ fontSize: 30, lineHeight: 40, fontWeight: "800" }}
                  >
                    {n(value)}
                  </Txt>
                </View>
              ))}
            </View>
          </Card>
          {!s.eligible_rounds && (
            <Txt testID="empty-statistics">{t("noStatistics")}</Txt>
          )}
          <Card>
            <Txt style={{ fontWeight: "800" }}>{t("scoreDistribution")}</Txt>
            {(
              [
                "eagle_or_better",
                "birdie",
                "par",
                "bogey",
                "double_or_worse",
              ] as const
            ).map((key) => (
              <View key={key} style={{ gap: 4 }}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Txt>{t(key)}</Txt>
                  <Txt>{s.distribution[key]}</Txt>
                </View>
                <View
                  style={{
                    height: 6,
                    backgroundColor: colors.mint,
                    borderRadius: 3,
                  }}
                >
                  <View
                    style={{
                      height: 6,
                      width: `${s.eligible_rounds ? (s.distribution[key] / (s.eligible_rounds * 18)) * 100 : 0}%`,
                      backgroundColor: colors.green,
                      borderRadius: 3,
                    }}
                  />
                </View>
              </View>
            ))}
          </Card>
          {!!s.by_par.length && (
            <Card>
              <Txt style={{ fontWeight: "800" }}>{t("parAverages")}</Txt>
              {s.by_par.map((row) => (
                <View
                  key={row.par}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <Txt>
                    PAR {row.par} · {row.holes} {t("hole")}
                  </Txt>
                  <Txt>{n(row.average_strokes)}</Txt>
                </View>
              ))}
            </Card>
          )}
          <Card>
            <Txt style={{ fontWeight: "800" }}>{t("excludedRecords")}</Txt>
            <Txt>
              {t("nineHoleRecords")} · {s.excluded.nine_hole}
            </Txt>
            <Txt>
              {t("incompleteRecords")} · {s.excluded.incomplete}
            </Txt>
            <Txt>
              {t("unlinkedRecords")} · {s.excluded.unlinked}
            </Txt>
          </Card>
          {!!s.recent.length && (
            <Txt style={{ fontSize: 22, fontWeight: "800" }}>
              {t("recentStatistics")}
            </Txt>
          )}
          {s.recent.map((r) => (
            <Card key={r.receipt_id}>
              <Txt style={{ fontWeight: "700" }}>{r.course_name}</Txt>
              <Txt>
                {new Date(r.ended_at).toLocaleDateString(
                  lang === "ko" ? "ko-KR" : "en-US",
                )}{" "}
                · {r.total_strokes} (
                {r.total_strokes - r.total_par > 0 ? "+" : ""}
                {r.total_strokes - r.total_par})
              </Txt>
              <Button
                label={t("openReceivedRecord")}
                secondary
                onPress={() =>
                  router.push({
                    pathname: "/record",
                    params: { id: r.receipt_id },
                  })
                }
              />
            </Card>
          ))}
        </>
      )}
      <Button
        label={t("refresh")}
        testID="refresh-statistics"
        secondary
        onPress={() => void query.reload()}
      />
    </>
  );
}
