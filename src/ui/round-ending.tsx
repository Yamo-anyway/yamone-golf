import React from "react";
import { router, useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import type { EndView } from "../../shared/round-ending";
import { golf } from "../data/golf";
import { sendEnd } from "../data/end-round";
import { Button, Card, colors, Txt } from "./components";
import { Heading, Problem } from "./courses";
import { confirm, useLoad, useTask } from "./golf-hooks";
import { useOfflineScores } from "./offline-scores";
import { PeoriaEntry } from "./peoria";
import { useSession } from "./session";
export function Completion({ data }: { data: EndView }) {
  const { t, lang } = useSession();
  return (
    <Card>
      <Txt style={{ fontWeight: "700" }}>
        {t(data.status === "ended" ? "roundEndedTitle" : "completionCheck")}
      </Txt>
      {data.status === "ended" && (
        <>
          <Txt testID="end-reason">
            {t(
              data.reason === "inactivity"
                ? "autoEndReason"
                : "manualEndReason",
            )}
          </Txt>
          {data.ended_at !== null && (
            <Txt>
              {new Date(data.ended_at).toLocaleString(
                lang === "ko" ? "ko-KR" : "en-US",
              )}
            </Txt>
          )}
        </>
      )}
      {data.players.map((p) => (
        <Txt key={p.slot_id} testID={"completion-" + p.slot_id}>
          {p.name} · {p.holes_recorded}/{data.hole_count} ·{" "}
          {t(p.complete ? "recordComplete" : "recordIncomplete")}
          {" · " + t("total") + " " + (p.total_strokes ?? "—")}
        </Txt>
      ))}
      <Txt style={{ color: colors.muted }}>{t("completionSeparate")}</Txt>
    </Card>
  );
}
export function EndedRoundSummary({ id }: { id: string }) {
  const query = useLoad(() => golf.ending(id));
  return (
    <>
      <Problem text={query.errorText} />
      {query.data && <Completion data={query.data} />}
      {query.data?.status === "ended" && <PeoriaEntry id={id} />}
    </>
  );
}
export function RoundEndingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile, t } = useSession(),
    state = useOfflineScores(profile!.user_id),
    task = useTask();
  const query = useLoad(async () => {
    await state.store.refresh(id);
    return golf.ending(id);
  });
  const data = query.data,
    local = state.data.rounds[id];
  const drafts = Object.keys(local?.drafts ?? {}),
    queued = Object.keys(local?.queue ?? {});
  const busy = task.busy || !state.ready;
  async function end() {
    if (!data) return;
    const yes =
      local?.endRequest ||
      (await confirm(t("endConfirmHelp"), t("endNow"), t("keepEditing")));
    if (!yes) return;
    await task.run(async () => {
      try {
        const result = await sendEnd(
          state.store,
          id,
          data.record_version,
          (request) => golf.end(id, request),
        );
        query.setData(result);
      } catch (e) {
        await query.reload();
        throw e;
      }
    });
  }
  const openHole = (hole?: number) =>
    void task.run(async () => {
      if (hole) await state.store.visit(id, hole);
      router.push({ pathname: "/scores", params: { id } });
    });
  return (
    <>
      <Heading
        title={t(data?.status === "ended" ? "roundEndedTitle" : "endRound")}
      />
      <Problem text={task.errorText || query.errorText} />
      {data && <Completion data={data} />}
      {(drafts.length > 0 || queued.length > 0) && (
        <Card>
          <Txt style={{ fontWeight: "700" }}>{t("endLocalTitle")}</Txt>
          <Txt testID="end-local-counts">
            {t("localDrafts")} {drafts.length} · {t("pendingHoles")}{" "}
            {queued.length}
          </Txt>
          <Txt>
            {t(data?.status === "ended" ? "endedOfflineHold" : "endLocalHelp")}
          </Txt>
          {drafts.map((h) => (
            <Button
              key={"d" + h}
              label={`${h} ${t("hole")} · ${t("localDrafts")}`}
              secondary
              testID={"end-draft-" + h}
              disabled={busy}
              onPress={() => openHole(Number(h))}
            />
          ))}
          {queued.map((h) => (
            <Button
              key={"q" + h}
              label={`${h} ${t("hole")} · ${t("pendingHoles")}`}
              secondary
              testID={"end-queue-" + h}
              disabled={busy}
              onPress={() => openHole(Number(h))}
            />
          ))}
          {data?.status === "active" && (
            <>
              <Button
                label={t("saveAllBeforeEnd")}
                testID="end-save-all"
                busy={task.busy}
                disabled={!state.ready}
                onPress={() =>
                  void task.run(async () => {
                    for (const h of drafts)
                      await state.store.enqueue(id, Number(h));
                    await state.store.sync();
                    await query.reload();
                  })
                }
              />
              {drafts.length > 0 && (
                <Button
                  label={t("discardAllDrafts")}
                  secondary
                  testID="end-discard-drafts"
                  disabled={busy}
                  onPress={() => {
                    const expected = JSON.stringify(local!.drafts);
                    void confirm(
                      t("discardAllDraftsHelp"),
                      t("discard"),
                      t("keepEditing"),
                    ).then((yes) => {
                      if (yes)
                        void task.run(() =>
                          state.store.discardDrafts(id, expected),
                        );
                    });
                  }}
                />
              )}
            </>
          )}
        </Card>
      )}
      {local?.endRequest ? (
        <Card>
          <Txt>{t("end_pending")}</Txt>
          <Button
            label={t("retryEnd")}
            testID="retry-end"
            busy={task.busy}
            disabled={!data || !state.ready}
            onPress={() => void end()}
          />
        </Card>
      ) : (
        data?.status === "active" && (
          <Card>
            <Txt>{t("endConfirmHelp")}</Txt>
            <Txt>{t("endNoExtraAd")}</Txt>
            {!data.can_end && <Txt>{t("end_forbidden")}</Txt>}
            <Button
              label={t("endNow")}
              testID="end-confirm"
              busy={task.busy}
              disabled={
                !data.can_end ||
                !local ||
                !state.ready ||
                !!drafts.length ||
                !!queued.length
              }
              onPress={() => void end()}
            />
          </Card>
        )
      )}
      {data?.status === "active" && data.is_creator && (
        <Card>
          <Txt style={{ fontWeight: "700" }}>{t("endPermissions")}</Txt>
          <Txt>{t("endPermissionsHelp")}</Txt>
          {data.participants
            .filter((p) => p.user_id !== profile!.user_id)
            .map((p) => (
              <Card key={p.user_id}>
                <Txt>
                  {p.nickname} · {p.personal_code}
                </Txt>
                <Button
                  label={t(p.can_end ? "revokeEnd" : "grantEnd")}
                  secondary
                  testID={"end-permission-" + p.user_id}
                  disabled={busy || !!local?.endRequest}
                  onPress={() => {
                    void confirm(
                      `${p.nickname} · ${p.personal_code}\n${t(p.can_end ? "revokeEnd" : "grantEnd")}?`,
                      t(p.can_end ? "revokeEnd" : "grantEnd"),
                      t("cancel"),
                    ).then((yes) => {
                      if (yes)
                        void task.run(async () => {
                          try {
                            query.setData(
                              await golf.endPermission(id, {
                                user_id: profile!.user_id,
                                mutation_id: Crypto.randomUUID(),
                                permission_version: data.permission_version,
                                participant_id: p.user_id,
                                can_end: !p.can_end,
                              }),
                            );
                          } catch (e) {
                            await query.reload();
                            throw e;
                          }
                        });
                    });
                  }}
                />
              </Card>
            ))}
        </Card>
      )}
      {data?.status === "active" && (
        <Button
          label={t("scorecard")}
          secondary
          disabled={busy}
          onPress={() =>
            router.push({ pathname: "/scorecard", params: { id } })
          }
        />
      )}
      {data?.status === "ended" && <PeoriaEntry id={id} />}
      {data?.status === "ended" && (
        <Button
          label={t("roundRecords")}
          testID="ending-records"
          onPress={() =>
            router.push({ pathname: "/round-records", params: { id } })
          }
        />
      )}
      <Button
        label={t("refresh")}
        secondary
        testID="refresh-ending"
        disabled={busy}
        onPress={() => void query.reload()}
      />
      <Button
        label={t(data?.status === "ended" ? "scorecard" : "keepEditing")}
        secondary
        testID="end-back-scores"
        disabled={busy}
        onPress={() =>
          data?.status === "ended"
            ? router.push({ pathname: "/scorecard", params: { id } })
            : openHole()
        }
      />
      <Button
        label={t("home")}
        secondary
        testID="end-home"
        disabled={busy}
        onPress={() => router.dismissTo("/")}
      />
    </>
  );
}
