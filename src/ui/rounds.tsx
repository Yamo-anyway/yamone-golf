import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import {
  golf,
  pendingRound,
  type AdResult,
  type Course,
  type CreateInput,
  type JoinInput,
  type PendingRound,
} from "../data/golf";
import { useOfflineScores } from "./offline-scores";
import { useSession } from "./session";
import { Button, Card, colors, Field, styles, Txt } from "./components";
import { Heading, Problem } from "./courses";
import { confirm, useDraftGuard, useLoad, useTask } from "./golf-hooks";
function CourseSummary({ course, holes }: { course: Course; holes: number }) {
  const { t } = useSession();
  return (
    <>
      <Txt style={{ fontSize: 22, lineHeight: 30, fontWeight: "700" }}>
        {course.name}
      </Txt>
      <Txt style={{ color: colors.muted }}>
        {course.region} · {holes}
        {t("hole")}
      </Txt>
      <Txt>{course.segments.map((s) => s.name).join(" → ")}</Txt>
    </>
  );
}
async function begin(user: string, input: CreateInput | JoinInput) {
  // Persist the exact request ID and input before any server mutation.
  const old = await pendingRound.read(user);
  if (!old)
    await pendingRound.write(user, { action_id: Crypto.randomUUID(), input });
  router.push("/round-action");
}
function OfflineRounds({ unavailable }: { unavailable: boolean }) {
  const { profile, t, offline } = useSession(),
    state = useOfflineScores(profile!.user_id);
  const rounds = Object.values(state.data.rounds).filter(
    (r) =>
      offline ||
      unavailable ||
      Object.keys(r.drafts).length ||
      Object.keys(r.queue).length,
  );
  return (
    <>
      {rounds.map((r) => (
        <Card key={r.sheet.round_id}>
          <Txt style={{ fontWeight: "700" }}>{t("localRound")}</Txt>
          <Txt>{r.sheet.course.name}</Txt>
          <Txt>
            {t("localDrafts")} {Object.keys(r.drafts).length} ·{" "}
            {t("pendingHoles")} {Object.keys(r.queue).length}
          </Txt>
          <Button
            label={t("resumeLocalScores")}
            testID={"resume-local-" + r.sheet.round_id}
            onPress={() =>
              router.push({
                pathname: "/scores",
                params: { id: r.sheet.round_id },
              })
            }
          />
        </Card>
      ))}
    </>
  );
}
export function HomeRounds() {
  const { profile, t } = useSession();
  const task = useLoad(async () => ({
    home: await golf.home(),
    pending: await pendingRound.read(profile!.user_id),
  }));
  const home = task.data?.home;
  return (
    <>
      <OfflineRounds unavailable={!!task.error} />
      <Problem text={task.errorText} />
      {task.data?.pending && (
        <Card>
          <Txt style={{ fontWeight: "700" }}>{t("pendingRound")}</Txt>
          <Button
            label={t("resumeRound")}
            testID="resume-round"
            onPress={() => router.push("/round-action")}
          />
        </Card>
      )}
      {home?.active_round ? (
        <Card>
          <Txt>{t("currentRound")}</Txt>
          <CourseSummary
            course={home.active_round.course}
            holes={home.active_round.hole_count}
          />
          <Button
            label={t("openRound")}
            testID="open-round"
            onPress={() =>
              router.push({
                pathname: "/round",
                params: { id: home.active_round!.round_id },
              })
            }
          />
          <Txt style={{ color: colors.muted }}>{t("singleRoundHelp")}</Txt>
        </Card>
      ) : (
        <Card>
          <Button
            label={t("newRound")}
            testID="new-round"
            disabled={!home || task.busy || !!task.data?.pending}
            onPress={() =>
              router.push({ pathname: "/courses", params: { select: "1" } })
            }
          />
          <Button
            label={t("joinRound")}
            testID="join-round"
            secondary
            disabled={!home || task.busy || !!task.data?.pending}
            onPress={() => router.push("/round-join")}
          />
        </Card>
      )}
      {!!home?.invitations.length && (
        <Txt style={{ fontSize: 22, lineHeight: 30, fontWeight: "700" }}>
          {t("invitations")}
        </Txt>
      )}
      {home?.invitations.map((invite) => (
        <Card key={invite.invitation_id}>
          <CourseSummary course={invite.course} holes={invite.hole_count} />
          <Txt>
            {t("invitedBy")}: {invite.sender_name}
          </Txt>
          <Button
            label={t("acceptInvite")}
            testID={"accept-" + invite.invitation_id}
            disabled={!!home.active_round || task.busy || !!task.data?.pending}
            onPress={() =>
              void task.run(() =>
                begin(profile!.user_id, {
                  kind: "join",
                  invitation_id: invite.invitation_id,
                }),
              )
            }
          />
          <Button
            label={t("declineInvite")}
            secondary
            testID={"decline-" + invite.invitation_id}
            disabled={task.busy}
            onPress={() =>
              void confirm(
                t("declineConfirm"),
                t("declineInvite"),
                t("cancel"),
              ).then((yes) => {
                if (yes)
                  void task.run(async () => {
                    await golf.decline(invite.invitation_id);
                    await task.reload();
                  });
              })
            }
          />
        </Card>
      ))}
      <Button
        label={t("courses")}
        secondary
        testID="courses"
        onPress={() => router.push("/courses")}
      />
      <Button
        label={t("refresh")}
        secondary
        testID="refresh-home"
        onPress={() => void task.reload()}
      />
    </>
  );
}
export function NewRoundScreen() {
  const { profile, t } = useSession();
  const { course_id } = useLocalSearchParams<{ course_id: string }>();
  const query = useLoad(async () => (await golf.course(course_id)).course),
    task = useTask();
  const [holes, setHoles] = useState<9 | 18>(18),
    [front, setFront] = useState(0),
    [back, setBack] = useState(0),
    [self, setSelf] = useState(true),
    [names, setNames] = useState([profile!.nickname]),
    [touched, setTouched] = useState(false),
    [saved, setSaved] = useState(false);
  useDraftGuard(touched && !saved);
  useEffect(() => {
    if (saved) router.replace("/round-action");
  }, [saved]);
  const c = query.data;
  const [frozen, setFrozen] = useState<Course | null>(null);
  const current = frozen ?? c;
  function touch() {
    if (!frozen && c) setFrozen(c);
    setTouched(true);
  }
  function selectHalf(
    label: string,
    value: number,
    onSelect: (n: number) => void,
  ) {
    return (
      <Card>
        <Txt style={{ fontWeight: "700" }}>{label}</Txt>
        {current!.segments.map((s, i) => (
          <Button
            key={i}
            label={`${s.name} · PAR ${s.pars.reduce((a, b) => a + b, 0)}`}
            secondary={value !== i}
            onPress={() => {
              touch();
              onSelect(i);
            }}
          />
        ))}
      </Card>
    );
  }
  return (
    <>
      <Heading title={t("roundSetup")} />
      <Problem text={task.errorText || query.errorText} />
      {!current ? (
        <Button label={t("retry")} onPress={() => void query.reload()} />
      ) : (
        <>
          <Card>
            <CourseSummary course={current} holes={holes} />
          </Card>
          <Txt style={{ fontWeight: "700" }}>{t("playedHoles")}</Txt>
          <View style={styles.row}>
            {([9, 18] as const).map((n) => (
              <View key={n} style={{ flex: 1 }}>
                <Button
                  label={`${n} ${t("hole")}`}
                  secondary={holes !== n}
                  onPress={() => {
                    touch();
                    setHoles(n);
                  }}
                />
              </View>
            ))}
          </View>
          {selectHalf(t("frontNine"), front, setFront)}
          {holes === 18 && selectHalf(t("backNine"), back, setBack)}
          {holes === 18 && <Txt>{t("repeatNine")}</Txt>}
          <Card>
            <Txt style={{ fontSize: 21, lineHeight: 29, fontWeight: "700" }}>
              {t("players")}
            </Txt>
            <Txt>{t("recorderHelp")}</Txt>
            <Button
              label={`${self ? "✓ " : ""}${t("selfPlay")}`}
              secondary={!self}
              testID="self-play"
              onPress={() => {
                touch();
                setSelf(!self);
              }}
            />
            {names.map((name, i) => (
              <Field
                key={i}
                label={`${t("player")} ${i + 1}${self && i === 0 ? " · " + t("selfPlay") : ""}`}
                testID={"player-" + i}
                value={name}
                maxLength={16}
                onChangeText={(value) => {
                  touch();
                  setNames(names.map((n, j) => (j === i ? value : n)));
                }}
              />
            ))}
            {names.length < 8 && (
              <Button
                label={t("addPlayer")}
                secondary
                testID="add-player"
                onPress={() => {
                  touch();
                  setNames([...names, ""]);
                }}
              />
            )}
            {names.length > 1 && (
              <Button
                label={t("removePlayer")}
                secondary
                onPress={() => {
                  touch();
                  setNames(names.slice(0, -1));
                }}
              />
            )}
          </Card>
          <Button
            label={t("reviewCreate")}
            testID="review-create"
            busy={task.busy}
            disabled={names.some((n) => !n.trim())}
            onPress={() =>
              void task.run(async () => {
                const old = await pendingRound.read(profile!.user_id);
                if (!old)
                  await pendingRound.write(profile!.user_id, {
                    action_id: Crypto.randomUUID(),
                    input: {
                      kind: "create",
                      course_id: current.course_id,
                      course_version: current.version,
                      segment_indices: holes === 9 ? [front] : [front, back],
                      players: names.map((name, i) => ({
                        name,
                        self: self && i === 0,
                      })),
                    },
                  });
                setSaved(true);
              })
            }
          />
          {saved && (
            <Button
              label={t("resumeRound")}
              testID="continue-create"
              onPress={() => router.replace("/round-action")}
            />
          )}
        </>
      )}
    </>
  );
}
export function JoinRoundScreen() {
  const { profile, t } = useSession(),
    task = useTask();
  const [code, setCode] = useState(""),
    [result, setResult] = useState<Awaited<
      ReturnType<typeof golf.lookup>
    > | null>(null);
  return (
    <>
      <Heading title={t("joinRound")} />
      <Problem text={task.errorText} />
      <Field
        label={t("roundCode")}
        testID="join-code"
        value={code}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={32}
        onChangeText={(value) => {
          setCode(value);
          setResult(null);
        }}
      />
      <Button
        label={t("lookup")}
        testID="lookup-round"
        busy={task.busy}
        disabled={!code.trim()}
        onPress={() =>
          void task.run(async () => setResult(await golf.lookup(code)))
        }
      />
      {result && (
        <Card>
          <CourseSummary
            course={result.round.course}
            holes={result.round.hole_count}
          />
          <Txt>
            {t("creator")}: {result.round.creator_name}
          </Txt>
          <Txt>{t("joinAsRecorder")}</Txt>
          <Button
            label={t("confirmJoin")}
            testID="confirm-join"
            busy={task.busy}
            onPress={() =>
              void task.run(() =>
                begin(profile!.user_id, { kind: "join", code }),
              )
            }
          />
        </Card>
      )}
    </>
  );
}
export function RoundActionScreen() {
  const { profile, t } = useSession();
  const query = useLoad(async () => {
    const pending = await pendingRound.read(profile!.user_id);
    if (!pending) return null;
    return { pending, action: await golf.prepare(pending) };
  });
  const task = useTask();
  const data = query.data;
  async function finish(outcome?: AdResult) {
    if (!data) return;
    await task.run(async () => {
      let pending: PendingRound = data.pending;
      if (outcome) {
        pending = { ...pending, outcome };
        await pendingRound.write(profile!.user_id, pending);
        query.setData({ ...data, pending });
      }
      // A recorded result survives both network failure and app restart. Never settle while merely displaying the ad test.
      let action = await golf.action(pending.action_id);
      if (!action.ad_settled && pending.outcome)
        action = await golf.settle(pending.action_id, pending.outcome);
      query.setData({ pending, action });
      const result = await golf.execute(action.action_id);
      await pendingRound.clear(profile!.user_id);
      router.replace({
        pathname: "/round",
        params: { id: result.round.round_id },
      });
    });
  }
  return (
    <>
      <Heading title={t("roundReview")} />
      <Problem text={task.errorText || query.errorText} />
      {!data ? (
        <Button label={t("retry")} onPress={() => void query.reload()} />
      ) : (
        <>
          <Card>
            <CourseSummary
              course={data.action.summary.course}
              holes={data.action.summary.hole_count}
            />
            {data.action.summary.players?.map((p, i) => (
              <Txt key={i}>
                {i + 1}. {p.name}
                {p.self ? " · " + t("selfPlay") : ""}
              </Txt>
            ))}
          </Card>
          {data.action.completed_round_id ||
          data.action.ad_settled ||
          data.pending.outcome ? (
            <Card>
              <Txt>{t("adSettled")}</Txt>
              <Button
                label={t("executeRound")}
                testID="execute-round"
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
                testID="ad-complete"
                busy={task.busy}
                onPress={() => void finish("completed")}
              />
              <Button
                label={t("testAdUnavailable")}
                testID="ad-unavailable"
                secondary
                disabled={task.busy}
                onPress={() => void finish("unavailable")}
              />
            </Card>
          ) : (
            <Txt>{t("ads_not_configured")}</Txt>
          )}
        </>
      )}
      <Button
        label={t("cancelAction")}
        secondary
        disabled={task.busy}
        testID="cancel-action"
        onPress={() =>
          void confirm(
            t("cancelActionHelp"),
            t("cancelAction"),
            t("keepEditing"),
          ).then((yes) => {
            if (yes)
              void task.run(async () => {
                await pendingRound.clear(profile!.user_id);
                router.dismissTo("/");
              });
          })
        }
      />
    </>
  );
}
export function RoundScreen() {
  const { t } = useSession(),
    { id } = useLocalSearchParams<{ id: string }>();
  const query = useLoad(() => golf.round(id)),
    task = useTask();
  const [code, setCode] = useState(""),
    [sent, setSent] = useState(false),
    [requestId, setRequestId] = useState(Crypto.randomUUID());
  const detail = query.data;
  return (
    <>
      <Heading title={t("currentRound")} />
      <Problem text={task.errorText || query.errorText} />
      {detail && (
        <>
          <Card>
            <CourseSummary
              course={detail.round.course}
              holes={detail.round.hole_count}
            />
            <Txt>{t("roundCode")}</Txt>
            <Txt
              selectable
              testID="round-code"
              style={{
                fontSize: 25,
                lineHeight: 33,
                fontWeight: "800",
                letterSpacing: 1,
              }}
            >
              {detail.round.join_code}
            </Txt>
            <Txt>{t("selectHint")}</Txt>
          </Card>
          <Card>
            <Txt style={{ fontWeight: "700" }}>
              {t("participants")} · {detail.participants.length}
            </Txt>
            {detail.participants.map((p) => (
              <Txt key={p.user_id}>
                {p.nickname}
                {p.user_id === detail.round.creator_id
                  ? " · " + t("creator")
                  : ""}
              </Txt>
            ))}
          </Card>
          <Card>
            <Txt style={{ fontWeight: "700" }}>
              {t("players")} · {detail.players.length}
            </Txt>
            {detail.players.map((p, i) => (
              <Txt key={p.slot_id}>
                {i + 1}. {p.name}
              </Txt>
            ))}
          </Card>
          <Button
            label={t("scoreEntry")}
            testID="enter-scores"
            onPress={() => router.push({ pathname: "/scores", params: { id } })}
          />
          <Button
            label={t("scorecard")}
            testID="round-scorecard"
            secondary
            onPress={() =>
              router.push({ pathname: "/scorecard", params: { id } })
            }
          />
          <Button
            label={t("playerManagement")}
            testID="manage-players"
            secondary
            onPress={() =>
              router.push({ pathname: "/players", params: { id } })
            }
          />
          <Button
            label={t("inputTargets")}
            testID="input-targets"
            secondary
            onPress={() =>
              router.push({ pathname: "/input-targets", params: { id } })
            }
          />
          <Card>
            <Txt style={{ fontWeight: "700" }}>{t("sendInvite")}</Txt>
            <Txt>{t("inviteHelp")}</Txt>
            <Field
              label={t("inviteCode")}
              testID="invite-code"
              value={code}
              maxLength={32}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!task.busy}
              onChangeText={(value) => {
                setCode(value);
                setSent(false);
                setRequestId(Crypto.randomUUID());
              }}
            />
            <Button
              label={t("sendInvite")}
              testID="send-invite"
              busy={task.busy}
              disabled={!code.trim() || sent}
              onPress={() =>
                void task.run(async () => {
                  await golf.invite(id, requestId, code);
                  setSent(true);
                })
              }
            />
            {sent && <Txt accessibilityRole="alert">{t("inviteSent")}</Txt>}
          </Card>
          <Txt style={{ color: colors.muted }}>{t("stage2RoundHelp")}</Txt>
        </>
      )}
      <Button
        label={t("refresh")}
        testID="refresh-round"
        secondary
        onPress={() => void query.reload()}
      />
    </>
  );
}
