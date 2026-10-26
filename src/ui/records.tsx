import { FlowNote } from "./round-flow";
import React, { useRef, useState } from "react";
import { View } from "react-native";
import type { RecordFilter } from "../../shared/personal-records";
import { PeoriaEntry } from "./peoria";
import { peoriaFlow } from "../data/peoria";
import { corrections } from "../data/corrections";
import { router, useLocalSearchParams } from "expo-router";
import { records, receiptFlow, receiveAPI } from "../data/records";
import { players } from "../data/players";
import type { AdEvidence } from "../data/ad-config";
import { presentInterstitial, waitUntilAdForeground } from "../data/mobile-ads";
import { AdAction, useAdActionLifetime } from "./ad-action";
import type { Delivery } from "../../shared/records";
import { Button, Card, colors, Field, Txt } from "./components";
import { Heading, Problem } from "./courses";
import { useSession } from "./session";
import { confirm, useLoad, useTask } from "./golf-hooks";
import { useMutationId } from "./players";
import { ScorecardContent } from "./scores";
import { useRecordBanner } from "./banner-context";
async function beginReceive(user: string, delivery: string) {
  await receiptFlow(user).begin(delivery);
  router.push("/receive-record");
}
function DeliveryInfo({ value }: { value: Delivery }) {
  const { t, lang } = useSession();
  return (
    <>
      <Txt style={{ fontWeight: "700", fontSize: 20, lineHeight: 28 }}>
        {value.course_name}
      </Txt>
      <Txt>
        {value.hole_count} {t("hole")} ·{" "}
        {new Date(value.ended_at).toLocaleDateString(
          lang === "ko" ? "ko-KR" : "en-US",
        )}
      </Txt>
      <Txt>
        {t("player")}: {value.recipient_name}
      </Txt>
      <Txt>
        {t("sentBy")}: {value.sender_name}
      </Txt>
    </>
  );
}
export function RecordsHomeEntry() {
  const { profile, t } = useSession();
  const query = useLoad(async () => ({
    inbox: await records.inbox(),
    pending: await receiptFlow(profile!.user_id).read(),
    peoria: await peoriaFlow(profile!.user_id).read(),
    corrections: await corrections(profile!.user_id).summaries(),
  }));
  return (
    <Card>
      <Txt style={{ fontWeight: "700" }}>{t("recordsTitle")}</Txt>
      {!!query.data?.inbox.items.length && (
        <Txt testID="record-inbox-count">
          {t("recordsToReceive")} · {query.data.inbox.items.length}
          {query.data.inbox.next_cursor ? "+" : ""}
        </Txt>
      )}
      {query.data?.pending && (
        <Button
          label={t("resumeReceipt")}
          secondary
          testID="home-resume-receipt"
          onPress={() => router.push("/receive-record")}
        />
      )}
      <Button
        label={t("openRecords")}
        testID="home-records"
        secondary
        onPress={() => router.push("/records")}
      />
      {query.data?.peoria && (
        <Button
          label={t("resumePeoria")}
          testID="home-resume-peoria"
          secondary
          onPress={() =>
            router.push({
              pathname: "/peoria",
              params: { id: query.data!.peoria!.round_id, origin: "round" },
            })
          }
        />
      )}
      {query.data?.corrections.map((r) => (
        <Button
          key={r.receipt_id}
          label={t("resumeCorrection") + " · " + r.course_name}
          secondary
          testID={"home-correction-" + r.receipt_id}
          onPress={() =>
            router.push({
              pathname: "/record-edit",
              params: { id: r.receipt_id },
            })
          }
        />
      ))}
    </Card>
  );
}
export function RecordsScreen() {
  const { profile, t, lang } = useSession(),
    task = useTask(),
    makeId = useMutationId();
  const [search, setSearch] = useState(""),
    [scope, setScope] = useState<RecordFilter>("all");
  const applied = useRef<{ q: string; scope: RecordFilter }>({
    q: "",
    scope: "all",
  });
  const query = useLoad(async () => ({
    inbox: await records.inbox(),
    mine: await records.mine(undefined, applied.current),
    filter: { ...applied.current },
    pending: await receiptFlow(profile!.user_id).read(),
  }));
  const data = query.data;
  return (
    <>
      <Heading title={t("recordsTitle")} />
      <FlowNote
        title={
          lang === "ko"
            ? "라운드 기록을 내 기록으로"
            : "Keep a round in your records"
        }
      >
        {lang === "ko"
          ? "라운드 중 점수 작성은 방의 스코어 입력에서 합니다. 종료 후 ‘기록 받기’를 하면 전체 라운드가 내 기록에 추가됩니다."
          : "Enter live scores inside the round. After it ends, receive the record to keep the entire round here."}
      </FlowNote>
      <Button
        label={t("statisticsTitle")}
        secondary
        testID="open-statistics"
        onPress={() => router.push("/statistics")}
      />
      <Problem text={task.errorText || query.errorText} />
      {data?.pending && (
        <Card>
          <Txt>{t("receiptPendingHelp")}</Txt>
          <Button
            label={t("resumeReceipt")}
            testID="resume-receipt"
            onPress={() => router.push("/receive-record")}
          />
        </Card>
      )}
      <Txt style={{ fontSize: 22, lineHeight: 30, fontWeight: "700" }}>
        {t("recordsToReceive")}
      </Txt>
      {data && !data.inbox.items.length && (
        <Txt testID="empty-inbox">{t("noRecordsToReceive")}</Txt>
      )}
      {data?.inbox.items.map((v) => (
        <Card key={v.delivery_id}>
          <DeliveryInfo value={v} />
          <Button
            label={t("receiveRecord")}
            testID={"receive-" + v.delivery_id}
            disabled={task.busy}
            onPress={() =>
              void task.run(() => beginReceive(profile!.user_id, v.delivery_id))
            }
          />
          <Button
            label={t("declineRecord")}
            secondary
            testID={"decline-record-" + v.delivery_id}
            disabled={task.busy}
            onPress={() =>
              void confirm(
                t("declineRecordHelp"),
                t("declineRecord"),
                t("cancel"),
              ).then((yes) => {
                if (yes)
                  void task.run(async () => {
                    await records.cancel(
                      v.delivery_id,
                      profile!.user_id,
                      makeId(["decline", v.delivery_id]),
                    );
                    await query.reload();
                  });
              })
            }
          />
        </Card>
      ))}
      {data?.inbox.next_cursor && (
        <Button
          label={t("moreRecords")}
          secondary
          disabled={task.busy}
          onPress={() =>
            void task.run(async () => {
              const next = await records.inbox(data.inbox.next_cursor);
              query.setData({
                ...data,
                inbox: { ...next, items: [...data.inbox.items, ...next.items] },
              });
            })
          }
        />
      )}
      <Txt style={{ fontSize: 22, lineHeight: 30, fontWeight: "700" }}>
        {t("receivedRecords")}
      </Txt>
      <Field
        label={t("searchMyRecords")}
        testID="record-search"
        value={search}
        onChangeText={setSearch}
        maxLength={100}
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {(["all", "statistics", "incomplete", "nine"] as const).map((key) => (
          <Button
            key={key}
            label={t(
              (
                {
                  all: "allRecords",
                  statistics: "eligibleRounds",
                  incomplete: "incompleteRecords",
                  nine: "nineHoleRecords",
                } as const
              )[key],
            )}
            secondary={scope !== key}
            disabled={task.busy}
            testID={"filter-" + key}
            onPress={() => setScope(key)}
          />
        ))}
      </View>
      <Button
        label={t("search")}
        testID="search-records"
        disabled={task.busy || !data}
        onPress={() =>
          void task.run(async () => {
            const filter = { q: search.trim(), scope };
            const mine = await records.mine(undefined, filter);
            applied.current = filter;
            query.setData((old) => (old ? { ...old, mine, filter } : old));
          })
        }
      />
      {data && !data.mine.items.length && (
        <Txt testID="empty-records">
          {t(
            data.filter.q || data.filter.scope !== "all"
              ? "noMatchingRecords"
              : "noReceivedRecords",
          )}
        </Txt>
      )}
      {data?.mine.items.map((r) => (
        <Card key={r.receipt_id}>
          <Txt style={{ fontWeight: "700" }}>{r.course_name}</Txt>
          <Txt>
            {t(r.current_player ? "myScore" : "unlinkedRecords")} ·{" "}
            {r.total_strokes ?? "—"} · {r.holes_recorded}/{r.hole_count}
          </Txt>
          <Txt>
            {r.hole_count} {t("hole")} ·{" "}
            {new Date(r.ended_at).toLocaleDateString(
              lang === "ko" ? "ko-KR" : "en-US",
            )}
          </Txt>
          <Button
            label={t("openReceivedRecord")}
            secondary
            testID={"record-" + r.receipt_id}
            onPress={() =>
              router.push({ pathname: "/record", params: { id: r.receipt_id } })
            }
          />
        </Card>
      ))}
      {data?.mine.next_cursor && (
        <Button
          label={t("moreRecords")}
          secondary
          disabled={task.busy}
          onPress={() =>
            void task.run(async () => {
              const next = await records.mine(
                data.mine.next_cursor,
                applied.current,
              );
              query.setData({
                ...data,
                mine: { ...next, items: [...data.mine.items, ...next.items] },
              });
            })
          }
        />
      )}
      <Button
        label={t("refresh")}
        testID="refresh-records"
        secondary
        disabled={task.busy}
        onPress={() => void query.reload()}
      />
    </>
  );
}
export function RoundDeliveriesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    { profile, t } = useSession(),
    task = useTask(),
    makeId = useMutationId();
  const query = useLoad(async () => ({
    roster: await players.roster(id),
    deliveries: await records.deliveries(id),
  }));
  const data = query.data;
  return (
    <>
      <Heading title={t("roundRecords")} />
      <Txt>{t("deliveryHelp")}</Txt>
      <Problem text={task.errorText || query.errorText} />
      {data?.roster.players.map((p) => (
        <Card key={p.slot_id}>
          <Txt style={{ fontWeight: "700" }}>{p.name}</Txt>
          <Txt>{p.personal_code ?? t("unregistered")}</Txt>
          {!!p.received_current && <Txt>{t("deliveryReceived")}</Txt>}
          {!!p.pending_delivery_id && <Txt>{t("deliveryPending")}</Txt>}
          <Button
            label={t(
              p.user_id === profile!.user_id
                ? "receiveMyRecord"
                : p.delivery_count
                  ? "sendRecordAgain"
                  : "sendRecord",
            )}
            testID={"send-record-" + p.slot_id}
            disabled={
              task.busy ||
              !p.user_id ||
              !!p.received_current ||
              (!!p.pending_delivery_id && p.user_id !== profile!.user_id)
            }
            onPress={() =>
              void task.run(async () => {
                let deliveryId = p.pending_delivery_id;
                if (!deliveryId) {
                  const latest = data.deliveries.items.find(
                    (v) => v.slot_id === p.slot_id,
                  );
                  const body = {
                    user_id: profile!.user_id,
                    slot_id: p.slot_id,
                    version: p.version,
                    recipient_id: p.user_id!,
                  };
                  const result = await records.send(id, {
                    ...body,
                    mutation_id: makeId([
                      "send",
                      body,
                      latest?.delivery_id,
                      latest?.status,
                    ]),
                  });
                  deliveryId = result.delivery.delivery_id;
                }
                if (p.user_id === profile!.user_id)
                  await beginReceive(profile!.user_id, deliveryId);
                else await query.reload();
              })
            }
          />
        </Card>
      ))}
      <Button
        label={t("playerManagement")}
        secondary
        testID="delivery-players"
        disabled={task.busy}
        onPress={() => router.push({ pathname: "/players", params: { id } })}
      />
      <Txt style={{ fontWeight: "700", fontSize: 22, lineHeight: 30 }}>
        {t("deliveryHistory")}
      </Txt>
      {data?.deliveries.items.map((v) => (
        <Card key={v.delivery_id}>
          <Txt>
            {v.recipient_name} ·{" "}
            {t(
              v.status === "pending"
                ? "deliveryPending"
                : v.status === "received"
                  ? "deliveryReceived"
                  : "deliveryCancelled",
            )}
          </Txt>
          <Txt>
            {t("sentBy")}: {v.sender_name}
          </Txt>
          {v.can_cancel && (
            <Button
              label={t("cancelDelivery")}
              secondary
              testID={"cancel-delivery-" + v.delivery_id}
              disabled={task.busy}
              onPress={() =>
                void confirm(
                  t("cancelDeliveryHelp"),
                  t("cancelDelivery"),
                  t("cancel"),
                ).then((yes) => {
                  if (yes)
                    void task.run(async () => {
                      await records.cancel(
                        v.delivery_id,
                        profile!.user_id,
                        makeId(["cancel", v.delivery_id]),
                      );
                      await query.reload();
                    });
                })
              }
            />
          )}
        </Card>
      ))}
      {data?.deliveries.next_cursor && (
        <Button
          label={t("moreRecords")}
          secondary
          disabled={task.busy}
          onPress={() =>
            void task.run(async () => {
              const next = await records.deliveries(
                id,
                data.deliveries.next_cursor,
              );
              query.setData({
                ...data,
                deliveries: {
                  ...next,
                  items: [...data.deliveries.items, ...next.items],
                },
              });
            })
          }
        />
      )}
      <Button
        label={t("refresh")}
        testID="refresh-deliveries"
        secondary
        disabled={task.busy}
        onPress={() => void query.reload()}
      />
    </>
  );
}
export function ReceiveRecordScreen() {
  const lifetime = useAdActionLifetime();
  const terminal = useRef<{ action: string; evidence: AdEvidence } | null>(
    null,
  );
  const { profile, t } = useSession(),
    task = useTask(),
    flow = receiptFlow(profile!.user_id);
  const query = useLoad(async () => {
    const pending = await flow.read();
    return pending
      ? { pending, action: await receiveAPI.prepare(pending) }
      : null;
  });
  const data = query.data;
  async function finish(mock?: AdEvidence, showAd = false) {
    if (!data) return;
    await task.run(async () => {
      const signal = lifetime.current.signal;
      const pendingBefore = await flow.read();
      if (!pendingBefore || pendingBefore.action_id !== data.pending.action_id)
        throw { code: "state_changed" };
      const current = await receiveAPI.prepare(pendingBefore);
      let evidence =
        terminal.current?.action === pendingBefore.action_id
          ? terminal.current.evidence
          : undefined;
      if (
        !pendingBefore.outcome &&
        !current.ad_settled &&
        !current.completed_receipt &&
        showAd &&
        !evidence
      ) {
        evidence =
          mock ?? (await presentInterstitial(current.test_ads, signal));
        terminal.current = { action: pendingBefore.action_id, evidence };
      }
      if (evidence) {
        const pending = await flow.outcome(
          data!.pending.action_id,
          evidence.outcome,
          evidence.source,
        );
        terminal.current = null;
        query.setData({ ...data!, pending });
      }
      await waitUntilAdForeground(signal);
      const receipt = await flow.finish(receiveAPI);
      router.replace({
        pathname: "/record",
        params: { id: receipt.receipt_id },
      });
    });
  }
  return (
    <>
      <Heading title={t("receiveRecord")} />
      <Problem text={task.errorText || query.errorText} />
      {data && (
        <>
          <Card>
            <DeliveryInfo value={data.action.delivery} />
            <Txt>{t("receiveWholeRound")}</Txt>
          </Card>
          {data.action.completed_receipt ||
          data.action.available ||
          (data.pending.outcome && !data.action.ad_settled) ? (
            data.action.completed_receipt ||
            data.action.ad_settled ||
            data.pending.outcome ? (
              <Card>
                <Txt>{t("receiveAdSettled")}</Txt>
                <Button
                  label={t("confirmReceive")}
                  testID="execute-receive"
                  busy={task.busy}
                  onPress={() => void finish()}
                />
              </Card>
            ) : (
              <AdAction
                prefix="receive-"
                testAllowed={data.action.test_ads}
                busy={task.busy}
                onRun={(mock) => void finish(mock, true)}
              />
            )
          ) : (
            <Txt>{t("delivery_unavailable")}</Txt>
          )}
        </>
      )}
      <Button
        label={t("retry")}
        testID="refresh-receive"
        secondary
        disabled={task.busy}
        onPress={() => void query.reload()}
      />
      <Button
        label={t("backToRecords")}
        secondary
        testID="cancel-receive"
        disabled={task.busy}
        onPress={() =>
          void task.run(async () => {
            if (
              !(await confirm(
                t("cancelReceiveHelp"),
                t("backToRecords"),
                t("cancel"),
              ))
            )
              return;
            const pending = await flow.read();
            if (pending) await flow.cancel(pending.action_id, receiveAPI);
            router.replace("/records");
          })
        }
      />
    </>
  );
}
export function RecordScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    { profile, t, lang } = useSession(),
    task = useTask(),
    makeId = useMutationId();
  const query = useLoad(() => records.detail(id));
  const data = query.data;
  useRecordBanner(
    "record-detail",
    !query.error &&
      data?.receipt.status === "received" &&
      data?.sheet?.status === "ended",
  );
  return (
    <>
      <Heading title={t("receivedRecord")} />
      <Problem text={task.errorText || query.errorText} />
      {data?.receipt.status === "deleted" && (
        <Card>
          <Txt testID="record-deleted">{t("recordDeleted")}</Txt>
        </Card>
      )}
      {data?.sheet && (
        <>
          <Txt style={{ color: colors.muted }}>
            {t("receivedWholeRoundHelp")}
          </Txt>
          <Card>
            <Txt>
              {t("editDeadline")} ·{" "}
              {new Date(data.edit.deadline).toLocaleString(
                lang === "ko" ? "ko-KR" : "en-US",
              )}
            </Txt>
            {data.edit.allowed ? (
              <Button
                label={t("editMyScores")}
                testID="edit-own-scores"
                secondary
                onPress={() =>
                  router.push({ pathname: "/record-edit", params: { id } })
                }
              />
            ) : (
              <Txt testID="record-edit-locked">
                {t(
                  data.edit.reason === "available"
                    ? "record_locked"
                    : data.edit.reason,
                )}
              </Txt>
            )}
          </Card>
          <PeoriaEntry id={data.receipt.round_id} origin="record" />
          <ScorecardContent sheet={data.sheet} />
          {data.can_manage && (
            <Button
              label={t("roundRecords")}
              secondary
              testID="record-deliveries"
              onPress={() =>
                router.push({
                  pathname: "/round-records",
                  params: { id: data.receipt.round_id },
                })
              }
            />
          )}
          <Button
            label={t("deletePersonalRecord")}
            secondary
            testID="delete-record"
            disabled={task.busy}
            onPress={() =>
              void confirm(
                t("deleteRecordHelp"),
                t("deletePersonalRecord"),
                t("cancel"),
              ).then((yes) => {
                if (yes)
                  void task.run(async () => {
                    await records.remove(
                      id,
                      profile!.user_id,
                      makeId(["delete-record", id]),
                    );
                    await query.reload();
                  });
              })
            }
          />
        </>
      )}
      <Button
        label={t("refresh")}
        secondary
        testID="refresh-record"
        disabled={task.busy}
        onPress={() => void query.reload()}
      />
      <Button
        label={t("backToRecords")}
        secondary
        testID="record-list"
        onPress={() => router.replace("/records")}
      />
    </>
  );
}
