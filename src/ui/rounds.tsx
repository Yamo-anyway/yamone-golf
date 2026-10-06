import React, { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import {
  golf,
  pendingRound,
  type Course,
  type CreateInput,
  type JoinInput,
  type PendingRound,
} from "../data/golf";
import { players } from "../data/players";
import { RoundSteps, FlowNote } from "./round-flow";
import { RecordsHomeEntry } from "./records";
import type { AdEvidence } from "../data/ad-config";
import { presentInterstitial, waitUntilAdForeground } from "../data/mobile-ads";
import { AdAction, useAdActionLifetime } from "./ad-action";
import { EndedRoundSummary } from "./round-ending";
import { useOfflineScores } from "./offline-scores";
import { useSession } from "./session";
import { Button, Card, colors, Field, styles, Txt } from "./components";
import { Heading, Problem } from "./courses";
import { Icon } from "./icons";
import { confirm, useDraftGuard, useLoad, useTask } from "./golf-hooks";
const layout = StyleSheet.create({
  hero: {
    backgroundColor: "#174E3F",
    borderRadius: 24,
    padding: 22,
    gap: 18,
    overflow: "hidden",
  },
  eyebrow: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  sectionTitle: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 8,
  },
  pill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 5,
    backgroundColor: "#DAEE94",
  },
  lightPill: {
    alignSelf: "flex-start",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#EDF3EC",
  },
  caption: { fontSize: 13, lineHeight: 20, color: colors.muted },
  rowAction: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  iconTile: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#EDF3EC",
    alignItems: "center",
    justifyContent: "center",
  },
  divider: { height: 1, backgroundColor: colors.line },
  person: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 42,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EDF3EC",
  },
});
function SectionTitle({ title, count }: { title: string; count?: number }) {
  return (
    <View style={layout.sectionHead}>
      <Txt accessibilityRole="header" style={layout.sectionTitle}>
        {title}
      </Txt>
      {count !== undefined && (
        <View style={layout.lightPill}>
          <Txt style={{ fontSize: 13, lineHeight: 20, fontWeight: "700" }}>
            {count}
          </Txt>
        </View>
      )}
    </View>
  );
}
function RoundRowAction({
  label,
  detail,
  icon,
  onPress,
  testID,
  disabled,
  danger,
}: {
  label: string;
  detail?: string;
  icon: React.ComponentProps<typeof Icon>["name"];
  onPress: () => void;
  testID?: string;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        layout.rowAction,
        { opacity: disabled ? 0.45 : pressed ? 0.65 : 1 },
      ]}
    >
      <View style={[layout.iconTile, danger && { backgroundColor: "#FFF1ED" }]}>
        <Icon
          name={icon}
          size={21}
          color={danger ? colors.error : colors.green}
        />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt
          style={{
            fontWeight: "700",
            color: danger ? colors.error : colors.ink,
          }}
        >
          {label}
        </Txt>
        {!!detail && <Txt style={layout.caption}>{detail}</Txt>}
      </View>
      <Icon
        name="chevron-right"
        size={18}
        color={danger ? colors.error : colors.muted}
      />
    </Pressable>
  );
}
function CourseSummary({
  course,
  holes,
  inverted = false,
}: {
  course: Course;
  holes: number;
  inverted?: boolean;
}) {
  const { t } = useSession();
  return (
    <View style={{ gap: 8 }}>
      <Txt
        style={{
          fontSize: 24,
          lineHeight: 32,
          fontWeight: "800",
          letterSpacing: -0.5,
          color: inverted ? "#FFFFFF" : colors.ink,
        }}
      >
        {course.name}
      </Txt>
      <Txt
        style={{
          fontSize: 14,
          lineHeight: 21,
          color: inverted ? "#CEE0D7" : colors.muted,
        }}
      >
        {[course.region, `${holes} ${t("hole")}`].filter(Boolean).join(" · ")}
      </Txt>
      {!!course.segments.length && (
        <Txt
          style={{
            fontSize: 14,
            lineHeight: 21,
            color: inverted ? "#CEE0D7" : colors.muted,
          }}
        >
          {course.segments.map((s) => s.name).join(" → ")}
        </Txt>
      )}
    </View>
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
      !!r.endRequest ||
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
            label={t(r.endRequest ? "retryEnd" : "resumeLocalScores")}
            testID={"resume-local-" + r.sheet.round_id}
            onPress={() =>
              router.push({
                pathname: r.endRequest ? "/round-ending" : "/scores",
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
  const { profile, t, lang } = useSession();
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
          <View style={styles.row}>
            <Icon name="clock" size={20} color={colors.green} />
            <Txt style={{ fontWeight: "700" }}>{t("pendingRound")}</Txt>
          </View>
          <Button
            label={t("resumeRound")}
            testID="resume-round"
            onPress={() => router.push("/round-action")}
          />
        </Card>
      )}
      {home?.active_round ? (
        <View style={layout.hero}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View style={layout.pill}>
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: "#174E3F",
                }}
              />
              <Txt
                style={{
                  fontSize: 12,
                  lineHeight: 18,
                  fontWeight: "800",
                  color: "#174E3F",
                }}
              >
                {t("currentRound")}
              </Txt>
            </View>
            <Icon name="flag" size={28} color="#DAEE94" />
          </View>
          <CourseSummary
            course={home.active_round.course}
            holes={home.active_round.hole_count}
            inverted
          />
          <Pressable
            testID="open-round"
            accessibilityRole="button"
            accessibilityLabel={t("openRound")}
            onPress={() =>
              router.push({
                pathname: "/round",
                params: { id: home.active_round!.round_id },
              })
            }
            style={({ pressed }) => ({
              minHeight: 54,
              paddingHorizontal: 18,
              paddingVertical: 14,
              borderRadius: 15,
              backgroundColor: "#DAEE94",
              opacity: pressed ? 0.8 : 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            })}
          >
            <Txt style={{ fontWeight: "800", color: "#174E3F" }}>
              {t("openRound")}
            </Txt>
            <Icon name="chevron-right" size={20} color="#174E3F" />
          </Pressable>
          <Txt style={{ fontSize: 12, lineHeight: 19, color: "#CEE0D7" }}>
            {t("singleRoundHelp")}
          </Txt>
        </View>
      ) : (
        <Card>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <View style={{ flex: 1, gap: 6 }}>
              <Txt style={[layout.eyebrow, { color: colors.muted }]}>
                LET’S PLAY
              </Txt>
              <Txt
                accessibilityRole="header"
                style={{
                  fontSize: 25,
                  lineHeight: 34,
                  letterSpacing: -0.6,
                  fontWeight: "800",
                }}
              >
                {lang === "ko"
                  ? "오늘의 라운드를\n시작해 볼까요?"
                  : "Ready for your\nnext round?"}
              </Txt>
            </View>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 22,
                backgroundColor: "#DAEE94",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="flag" size={32} color="#174E3F" />
            </View>
          </View>
          <Txt style={layout.caption}>
            {lang === "ko"
              ? "골프장을 고르고 동반자와 함께 기록하세요."
              : "Choose a course and keep score together."}
          </Txt>
          <Button
            label={lang === "ko" ? "라운드 방 만들기" : t("newRound")}
            icon={<Icon name="plus" size={20} color="#FFFFFF" />}
            testID="new-round"
            disabled={!home || task.busy || !!task.data?.pending}
            onPress={() =>
              router.push({ pathname: "/courses", params: { select: "1" } })
            }
          />
          <RoundRowAction
            label={lang === "ko" ? "코드로 방 참여하기" : t("joinRound")}
            detail={
              lang === "ko"
                ? "전달받은 라운드 코드로 참여"
                : "Join using your round code"
            }
            icon="user"
            testID="join-round"
            disabled={!home || task.busy || !!task.data?.pending}
            onPress={() => router.push("/round-join")}
          />
        </Card>
      )}
      {!!home?.invitations.length && (
        <SectionTitle
          title={t("invitations")}
          count={home.invitations.length}
        />
      )}
      {home?.invitations.map((invite) => (
        <Card key={invite.invitation_id}>
          <Txt style={layout.caption}>
            {t("invitedBy")} · {invite.sender_name}
          </Txt>
          <CourseSummary course={invite.course} holes={invite.hole_count} />
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
          <Pressable
            testID={"decline-" + invite.invitation_id}
            accessibilityRole="button"
            accessibilityLabel={t("declineInvite")}
            accessibilityState={{ disabled: task.busy }}
            disabled={task.busy}
            style={({ pressed }) => ({
              minHeight: 48,
              justifyContent: "center",
              alignItems: "center",
              opacity: task.busy ? 0.45 : pressed ? 0.6 : 1,
            })}
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
          >
            <Txt
              style={{ color: colors.muted, fontWeight: "600", fontSize: 14 }}
            >
              {t("declineInvite")}
            </Txt>
          </Pressable>
        </Card>
      ))}
      <RecordsHomeEntry />
      {!!home?.ended_rounds?.length && (
        <SectionTitle title={t("recentEndedRounds")} />
      )}
      {!!home?.ended_rounds?.length && (
        <Card>
          {home.ended_rounds.map((r, i) => (
            <React.Fragment key={r.round_id}>
              {i > 0 && <View style={layout.divider} />}
              <RoundRowAction
                label={r.course.name}
                detail={`${r.hole_count} ${t("hole")} · ${t("roundEndedTitle")}`}
                icon="scorecard"
                testID={"ended-round-" + r.round_id}
                onPress={() =>
                  router.push({
                    pathname: "/round",
                    params: { id: r.round_id },
                  })
                }
              />
            </React.Fragment>
          ))}
        </Card>
      )}
      <Card>
        <RoundRowAction
          label={t("courses")}
          icon="flag"
          testID="courses"
          onPress={() => router.push("/courses")}
        />
      </Card>
      <Pressable
        testID="refresh-home"
        accessibilityRole="button"
        accessibilityLabel={t("refresh")}
        onPress={() => void task.reload()}
        style={({ pressed }) => ({
          minHeight: 48,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Txt style={{ color: colors.muted, fontSize: 13 }}>{t("refresh")}</Txt>
      </Pressable>
    </>
  );
}
export function NewRoundScreen() {
  const { profile, t, lang } = useSession();
  const { course_id } = useLocalSearchParams<{ course_id: string }>();
  const query = useLoad(async () => (await golf.course(course_id)).course),
    task = useTask();
  const [step, setStep] = useState(0),
    [holes, setHoles] = useState<9 | 18>(18),
    [front, setFront] = useState(0),
    [back, setBack] = useState(0),
    [self, setSelf] = useState(true),
    [names, setNames] = useState([profile!.nickname]),
    [touched, setTouched] = useState(false),
    [saved, setSaved] = useState(false);
  const scroll = useRef<ScrollView>(null);
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
  function goStep(value: number) {
    setStep(value);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }
  function chooseRole(value: boolean) {
    if (value === self || (value && names.length === 8)) return;
    touch();
    setSelf(value);
    // Removing the recorder from the roster must remove their name as well.
    setNames(
      value
        ? [
            profile!.nickname,
            ...(names.length === 1 && !names[0].trim() ? [] : names),
          ]
        : names.slice(1).length
          ? names.slice(1)
          : [""],
    );
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
          <Pressable
            key={i}
            accessibilityRole="radio"
            accessibilityLabel={`${s.name} · PAR ${s.pars.reduce((a, b) => a + b, 0)}`}
            accessibilityState={{ checked: value === i }}
            onPress={() => {
              touch();
              onSelect(i);
            }}
            style={({ pressed }) => ({
              minHeight: 56,
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderWidth: 1,
              borderColor: value === i ? colors.green : colors.line,
              backgroundColor: value === i ? "#EDF3EC" : "#FFFFFF",
              opacity: pressed ? 0.7 : 1,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
            })}
          >
            <View style={{ flex: 1 }}>
              <Txt style={{ fontWeight: "700" }}>{s.name}</Txt>
              <Txt style={layout.caption}>
                PAR {s.pars.reduce((a, b) => a + b, 0)}
              </Txt>
            </View>
            <View
              style={{
                width: 23,
                height: 23,
                borderRadius: 12,
                borderWidth: value === i ? 0 : 1.5,
                borderColor: colors.line,
                backgroundColor: value === i ? colors.green : "#FFFFFF",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {value === i && <Icon name="check" size={15} color="#FFFFFF" />}
            </View>
          </Pressable>
        ))}
      </Card>
    );
  }
  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: 16, paddingTop: 8, gap: 16 }}>
        <Heading
          title={lang === "ko" ? "라운드 방 만들기" : "Create a round"}
          onBack={step > 0 ? () => goStep(step - 1) : undefined}
        />
        <RoundSteps step={step + 1} />
      </View>
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 18 }}
      >
        <Problem text={task.errorText || query.errorText} />
        {!current ? (
          <Button label={t("retry")} onPress={() => void query.reload()} />
        ) : (
          <>
            <Card>
              <CourseSummary
                course={{
                  ...current,
                  segments: (holes === 9 ? [front] : [front, back]).map(
                    (i) => current.segments[i],
                  ),
                }}
                holes={holes}
              />
            </Card>
            {step === 0 ? (
              <>
                <SectionTitle title={t("playedHoles")} />
                <View style={styles.row}>
                  {([9, 18] as const).map((n) => (
                    <View key={n} style={{ flex: 1 }}>
                      <Button
                        label={`${n} ${t("hole")}`}
                        testID={`setup-holes-${n}`}
                        secondary={holes !== n}
                        onPress={() => {
                          touch();
                          setHoles(n);
                        }}
                      />
                    </View>
                  ))}
                </View>
                {holes === 9 && (
                  <FlowNote
                    title={
                      lang === "ko"
                        ? "9홀도 기록할 수 있어요"
                        : "A nine-hole round"
                    }
                  >
                    {lang === "ko"
                      ? "기록은 보관되며 개인 18홀 통계에는 포함되지 않습니다."
                      : "Your record is kept, but excluded from personal 18-hole statistics."}
                  </FlowNote>
                )}
                {selectHalf(t("frontNine"), front, setFront)}
                {holes === 18 && selectHalf(t("backNine"), back, setBack)}
                {holes === 18 && (
                  <Txt style={layout.caption}>{t("repeatNine")}</Txt>
                )}
              </>
            ) : (
              <>
                <SectionTitle
                  title={
                    lang === "ko"
                      ? "이번 라운드에서 나는"
                      : "My role this round"
                  }
                />
                <View style={{ gap: 10 }}>
                  <Button
                    label={
                      lang === "ko"
                        ? "나도 플레이 + 기록"
                        : "Play and keep score"
                    }
                    secondary={!self}
                    testID="self-play"
                    disabled={!self && names.length === 8}
                    onPress={() => chooseRole(true)}
                  />
                  <Button
                    label={
                      lang === "ko"
                        ? "플레이하지 않고 기록만"
                        : "Keep score only"
                    }
                    secondary={self}
                    testID="recorder-only"
                    onPress={() => chooseRole(false)}
                  />
                </View>
                <FlowNote
                  title={
                    lang === "ko"
                      ? self
                        ? "내 점수도 함께 기록해요"
                        : "동반자의 점수를 기록해요"
                      : self
                        ? "You are a player too"
                        : "You are the recorder"
                  }
                >
                  {lang === "ko"
                    ? self
                      ? "첫 번째 플레이어에 내 사용자가 연결됩니다."
                      : "나는 방에 참여하지만 플레이어 수에는 포함되지 않습니다."
                    : self
                      ? "Your user is linked to the first player."
                      : "You join the room without taking a player slot."}
                </FlowNote>
                <Card>
                  <SectionTitle title={t("players")} count={names.length} />
                  <Txt style={layout.caption}>
                    {lang === "ko"
                      ? "1~8명 · 이름을 비워 두면 임시 이름으로 시작합니다."
                      : "1–8 players · Blank names use temporary labels."}
                  </Txt>
                  {names.map((name, i) => (
                    <Field
                      key={i}
                      label={`${t("player")} ${i + 1}${self && i === 0 ? " · " + t("selfPlay") : ""}`}
                      testID={"player-" + i}
                      value={name}
                      placeholder={`${t("player")} ${i + 1}`}
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
                      icon={<Icon name="plus" size={18} color={colors.green} />}
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
                      quiet
                      secondary
                      onPress={() => {
                        touch();
                        setNames(names.slice(0, -1));
                      }}
                    />
                  )}
                </Card>
              </>
            )}
          </>
        )}
      </ScrollView>
      <View
        style={{
          borderTopWidth: 1,
          borderColor: colors.line,
          padding: 16,
          gap: 8,
          backgroundColor: "#FFFFFF",
        }}
      >
        <Txt style={layout.caption}>
          {lang === "ko"
            ? "최종 확인 후 방이 생성됩니다."
            : "Your round is created after final confirmation."}
        </Txt>
        {step === 0 ? (
          <Button
            label={lang === "ko" ? "다음 · 플레이어 설정" : "Next · Players"}
            testID="setup-players"
            disabled={!current}
            onPress={() => goStep(1)}
          />
        ) : (
          <Button
            label={t("reviewCreate")}
            testID="review-create"
            busy={task.busy}
            disabled={!current}
            onPress={() =>
              void task.run(async () => {
                const old = await pendingRound.read(profile!.user_id);
                if (!old)
                  await pendingRound.write(profile!.user_id, {
                    action_id: Crypto.randomUUID(),
                    input: {
                      kind: "create",
                      course_id: current!.course_id,
                      course_version: current!.version,
                      segment_indices: holes === 9 ? [front] : [front, back],
                      players: names.map((name, i) => ({
                        name: name.trim() || `${t("player")} ${i + 1}`,
                        self: self && i === 0,
                      })),
                    },
                  });
                setSaved(true);
              })
            }
          />
        )}
      </View>
    </View>
  );
}
export function JoinRoundScreen() {
  const { profile, t, lang } = useSession(),
    task = useTask();
  const [code, setCode] = useState(""),
    [result, setResult] = useState<Awaited<
      ReturnType<typeof golf.lookup>
    > | null>(null);
  return (
    <>
      <Heading title={t("joinRound")} />
      <FlowNote
        title={
          lang === "ko" ? "친구가 만든 방에 참여" : "Join your group’s room"
        }
      >
        {lang === "ko"
          ? "라운드 참여 코드를 입력하고 골프장과 생성자를 확인하세요. 개인 코드는 플레이어 연결에 사용합니다."
          : "Enter the round code, then check the course and host. Personal codes are for linking players."}
      </FlowNote>
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
  const { profile, t, lang } = useSession();
  const lifetime = useAdActionLifetime();
  const terminal = useRef<{ action: string; evidence: AdEvidence } | null>(
    null,
  );
  const query = useLoad(async () => {
    const pending = await pendingRound.read(profile!.user_id);
    if (!pending) return null;
    return { pending, action: await golf.prepare(pending) };
  });
  const task = useTask();
  const data = query.data;
  async function finish(mock?: AdEvidence, showAd = false) {
    if (!data) return;
    await task.run(async () => {
      let pending: PendingRound | null = await pendingRound.read(
        profile!.user_id,
      );
      if (!pending || pending.action_id !== data.pending.action_id)
        throw { code: "state_changed" };
      const signal = lifetime.current.signal;
      const current = await golf.action(pending.action_id);
      let evidence =
        terminal.current?.action === pending.action_id
          ? terminal.current.evidence
          : undefined;
      if (
        !pending.outcome &&
        !current.ad_settled &&
        !current.completed_round_id &&
        showAd &&
        !evidence
      ) {
        evidence =
          mock ?? (await presentInterstitial(current.test_ads, signal));
        terminal.current = { action: pending.action_id, evidence };
      }
      if (evidence) {
        pending = { ...pending, ...evidence };
        await pendingRound.write(profile!.user_id, pending);
        terminal.current = null;
        query.setData({ ...data, pending });
      }
      // Persist the terminal event BEFORE waiting for foreground or networking.
      await waitUntilAdForeground(signal);
      let action = await golf.action(pending.action_id);
      if (!action.ad_settled && pending.outcome)
        action = await golf.settle(
          pending.action_id,
          pending.outcome,
          pending.source,
        );
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
      {data?.action.kind === "create" && <RoundSteps step={3} />}
      {data && (
        <FlowNote
          title={
            lang === "ko"
              ? data.action.kind === "create"
                ? "새 방을 만듭니다"
                : "이 방에 기록 참여자로 들어갑니다"
              : data.action.kind === "create"
                ? "Create a new room"
                : "Join as a recording participant"
          }
        >
          {lang === "ko"
            ? "참여 후 내가 기록할 플레이어를 선택할 수 있어요. 실제 플레이어 연결과 입력 대상 선택은 별개입니다."
            : "After joining, choose whose scores you record. Player identity and your scoring list are separate."}
        </FlowNote>
      )}
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
          ) : (
            <AdAction
              testAllowed={data.action.test_ads}
              busy={task.busy}
              onRun={(mock) => void finish(mock, true)}
            />
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
                const pending = await pendingRound.read(profile!.user_id);
                if (pending?.outcome) {
                  const action = await golf.action(pending.action_id);
                  if (!action.ad_settled && !action.completed_round_id)
                    await golf.settle(
                      pending.action_id,
                      pending.outcome,
                      pending.source,
                    );
                  // Keep the same action/proof available via Home. Clearing it
                  // here could force another ad after a failed execute request.
                  router.dismissTo("/");
                  return;
                }
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
  const { t, lang, profile } = useSession(),
    { id } = useLocalSearchParams<{ id: string }>();
  const query = useLoad(() => golf.round(id)),
    task = useTask();
  const [code, setCode] = useState(""),
    [sent, setSent] = useState(false),
    [requestId, setRequestId] = useState(Crypto.randomUUID());
  const detail = query.data;
  const scoring = useLoad(() => players.targets(id));
  const me = detail?.players.find((p) => p.user_id === profile!.user_id);
  return (
    <>
      <Heading
        title={t(
          detail?.round.status === "ended" ? "roundEndedTitle" : "currentRound",
        )}
      />
      <Problem text={task.errorText || query.errorText} />
      {detail && (
        <>
          <View style={layout.hero}>
            <View style={layout.pill}>
              <Icon
                name={detail.round.status === "active" ? "flag" : "check"}
                size={14}
                color="#174E3F"
              />
              <Txt
                style={{
                  fontSize: 12,
                  lineHeight: 18,
                  fontWeight: "800",
                  color: "#174E3F",
                }}
              >
                {t(
                  detail.round.status === "active"
                    ? "currentRound"
                    : "roundEndedTitle",
                )}
              </Txt>
            </View>
            <CourseSummary
              course={detail.round.course}
              holes={detail.round.hole_count}
              inverted
            />
            <Txt style={{ color: "#CEE0D7", fontSize: 13, lineHeight: 20 }}>
              {t("players")} {detail.players.length} · {t("participants")}{" "}
              {detail.participants.length}
            </Txt>
          </View>
          {detail.round.status === "active" && (
            <Card>
              <Txt style={{ fontWeight: "800", fontSize: 18 }}>
                {lang === "ko" ? "내 기록 준비" : "Ready to keep score"}
              </Txt>
              <Txt testID="round-my-role" style={layout.caption}>
                {lang === "ko"
                  ? me
                    ? `플레이어 · ${me.name} / 기록 참여자`
                    : "기록 참여자 · 내 플레이어 연결 없음"
                  : me
                    ? `Player · ${me.name} / Recorder`
                    : "Recorder · no player linked to you"}
              </Txt>
              <Txt style={layout.caption}>
                {lang === "ko"
                  ? "내 입력 대상은 내가 점수를 작성할 사람입니다. 선택해도 플레이어의 사용자 연결은 바뀌지 않아요."
                  : "Your scoring list selects whose scores you enter. It does not change their linked identity."}
              </Txt>
              <Button
                label={t("scoreEntry")}
                icon={<Icon name="edit" size={20} color="#FFFFFF" />}
                testID="enter-scores"
                onPress={() =>
                  router.push({
                    pathname: scoring.data?.slot_ids.length
                      ? "/scores"
                      : "/input-targets",
                    params: { id },
                  })
                }
              />
              <Button
                label={
                  lang === "ko"
                    ? `내 입력 대상 확인${scoring.data ? ` · ${scoring.data.slot_ids.length}명` : ""}`
                    : "Choose scoring players"
                }
                secondary
                testID="prepare-targets"
                onPress={() =>
                  router.push({ pathname: "/input-targets", params: { id } })
                }
              />
            </Card>
          )}
          <Button
            label={t("scorecard")}
            icon={<Icon name="scorecard" size={20} color={colors.green} />}
            testID="round-scorecard"
            secondary
            onPress={() =>
              router.push({ pathname: "/scorecard", params: { id } })
            }
          />
          {detail.round.status === "ended" && (
            <>
              <EndedRoundSummary id={id} />
              <Button
                label={t("roundRecords")}
                testID="round-records"
                onPress={() =>
                  router.push({ pathname: "/round-records", params: { id } })
                }
              />
            </>
          )}
          <SectionTitle
            title={lang === "ko" ? "방 전체 설정" : "Shared room settings"}
          />
          <Card>
            <View style={{ gap: 8 }}>
              <Txt
                style={{ fontSize: 13, fontWeight: "700", color: colors.muted }}
              >
                {t("players")} · {detail.players.length}
              </Txt>
              {detail.players.map((p, i) => (
                <View key={p.slot_id} style={layout.person}>
                  <View style={layout.avatar}>
                    <Txt style={{ fontSize: 12, fontWeight: "700" }}>
                      {String(i + 1).padStart(2, "0")}
                    </Txt>
                  </View>
                  <Txt style={{ flex: 1, fontWeight: "600" }}>
                    {p.name}
                    {p.user_id === profile!.user_id
                      ? lang === "ko"
                        ? " · 나"
                        : " · Me"
                      : ""}
                  </Txt>
                </View>
              ))}
            </View>
            <View style={layout.divider} />
            <RoundRowAction
              label={t("playerManagement")}
              icon="user"
              testID="manage-players"
              onPress={() =>
                router.push({ pathname: "/players", params: { id } })
              }
            />
            {detail.round.status === "active" && (
              <>
                <View style={layout.divider} />
                <RoundRowAction
                  label={t("inputTargets")}
                  icon="scorecard"
                  testID="input-targets"
                  onPress={() =>
                    router.push({ pathname: "/input-targets", params: { id } })
                  }
                />
              </>
            )}
          </Card>
          <Card>
            <Txt style={{ fontWeight: "700" }}>
              {t("participants")} · {detail.participants.length}
            </Txt>
            {detail.participants.map((p) => (
              <View
                key={p.user_id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  minHeight: 32,
                }}
              >
                <Txt style={{ flex: 1 }}>{p.nickname}</Txt>
                {p.user_id === detail.round.creator_id && (
                  <View style={layout.lightPill}>
                    <Txt
                      style={{
                        fontSize: 11,
                        lineHeight: 18,
                        fontWeight: "700",
                      }}
                    >
                      {t("creator")}
                    </Txt>
                  </View>
                )}
              </View>
            ))}
          </Card>
          {detail.round.status === "active" && (
            <>
              <SectionTitle
                title={lang === "ko" ? "함께 참여하기" : "Invite your group"}
              />
              <Card>
                <Txt
                  style={{
                    fontSize: 13,
                    color: colors.muted,
                    fontWeight: "700",
                  }}
                >
                  {t("roundCode")}
                </Txt>
                <View
                  style={{
                    borderRadius: 14,
                    paddingVertical: 16,
                    paddingHorizontal: 18,
                    backgroundColor: "#F5F6F2",
                  }}
                >
                  <Txt
                    selectable
                    testID="round-code"
                    style={{
                      fontSize: 27,
                      lineHeight: 36,
                      fontWeight: "800",
                      letterSpacing: 2,
                    }}
                  >
                    {detail.round.join_code}
                  </Txt>
                </View>
                <Txt style={layout.caption}>{t("selectHint")}</Txt>
                <View style={layout.divider} />
                <Txt style={{ fontWeight: "700" }}>{t("sendInvite")}</Txt>
                <Txt style={layout.caption}>{t("inviteHelp")}</Txt>
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
                  secondary
                  busy={task.busy}
                  disabled={!code.trim() || sent}
                  onPress={() =>
                    void task.run(async () => {
                      await golf.invite(id, requestId, code);
                      setSent(true);
                    })
                  }
                />
                {sent && (
                  <Txt
                    accessibilityRole="alert"
                    style={{ color: colors.green, fontWeight: "700" }}
                  >
                    {t("inviteSent")}
                  </Txt>
                )}
              </Card>
              <View style={{ marginTop: 12, gap: 12 }}>
                <Txt style={layout.caption}>{t("roundActivityHelp")}</Txt>
                <Card>
                  <RoundRowAction
                    label={t("endRound")}
                    icon="flag"
                    testID="end-round"
                    danger
                    onPress={() =>
                      router.push({ pathname: "/round-ending", params: { id } })
                    }
                  />
                </Card>
              </View>
            </>
          )}
        </>
      )}
      <Pressable
        testID="refresh-round"
        accessibilityRole="button"
        accessibilityLabel={t("refresh")}
        onPress={() => void query.reload()}
        style={({ pressed }) => ({
          minHeight: 48,
          justifyContent: "center",
          alignItems: "center",
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Txt style={{ color: colors.muted, fontSize: 13 }}>{t("refresh")}</Txt>
      </Pressable>
    </>
  );
}
