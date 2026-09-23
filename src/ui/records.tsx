import React from "react";
import { router, useLocalSearchParams } from "expo-router";
import { records, receiptFlow, receiveAPI } from "../data/records";
import { players } from "../data/players";
import type { AdResult } from "../data/golf";
import type { Delivery } from "../../shared/records";
import { Button, Card, colors, Txt } from "./components";
import { Heading, Problem } from "./courses";
import { useSession } from "./session";
import { confirm, useLoad, useTask } from "./golf-hooks";
import { useMutationId } from "./players";
import { ScorecardContent } from "./scores";
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
    </Card>
  );
}
export function RecordsScreen() {
  const { profile, t, lang } = useSession(),
    task = useTask(),
    makeId = useMutationId();
  const query = useLoad(async () => ({
    inbox: await records.inbox(),
    mine: await records.mine(),
    pending: await receiptFlow(profile!.user_id).read(),
  }));
  const data = query.data;
  return (
    <>
      <Heading title={t("recordsTitle")} />
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
      {data && !data.mine.items.length && (
        <Txt testID="empty-records">{t("noReceivedRecords")}</Txt>
      )}
      {data?.mine.items.map((r) => (
        <Card key={r.receipt_id}>
          <Txt style={{ fontWeight: "700" }}>{r.course_name}</Txt>
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
              const next = await records.mine(data.mine.next_cursor);
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
  async function finish(outcome?: AdResult) {
    if (!data) return;
    await task.run(async () => {
      if (outcome) {
        const pending = await flow.outcome(data!.pending.action_id, outcome);
        query.setData({ ...data!, pending });
      }
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
            ) : data.action.test_ads ? (
              <Card>
                <Txt style={{ fontWeight: "700" }}>{t("testAdTitle")}</Txt>
                <Txt>{t("testAdBody")}</Txt>
                <Button
                  label={t("testAdComplete")}
                  testID="receive-ad-complete"
                  busy={task.busy}
                  onPress={() => void finish("completed")}
                />
                <Button
                  label={t("testAdUnavailable")}
                  testID="receive-ad-unavailable"
                  secondary
                  disabled={task.busy}
                  onPress={() => void finish("unavailable")}
                />
              </Card>
            ) : (
              <Txt>{t("ads_not_configured")}</Txt>
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
    { profile, t } = useSession(),
    task = useTask(),
    makeId = useMutationId();
  const query = useLoad(() => records.detail(id));
  const data = query.data;
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
