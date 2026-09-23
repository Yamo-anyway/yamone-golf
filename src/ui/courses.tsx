import React, { useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import { golf, type Course } from "../data/golf";
import { useSession } from "./session";
import { Button, Card, colors, Field, styles, Txt } from "./components";
import { confirm, useDraftGuard, useLoad, useTask } from "./golf-hooks";
export function Problem({ text }: { text: string }) {
  return text ? (
    <Txt accessibilityRole="alert" style={{ color: colors.error }}>
      {text}
    </Txt>
  ) : null;
}
export function Heading({ title }: { title: string }) {
  const { t } = useSession();
  return (
    <View style={{ gap: 12 }}>
      <Button
        label={t("back")}
        secondary
        onPress={() =>
          router.canGoBack() ? router.back() : router.dismissTo("/")
        }
      />
      <Txt style={styles.title}>{title}</Txt>
    </View>
  );
}
function DragRow({
  children,
  onDrop,
  label,
  disabled,
  onHeight,
}: {
  children: React.ReactNode;
  onDrop: (dy: number) => void;
  label: string;
  disabled: boolean;
  onHeight: (height: number) => void;
}) {
  const [offset, setOffset] = useState(0);
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderMove: (_, g) => setOffset(g.dy),
        onPanResponderRelease: (_, g) => {
          setOffset(0);
          onDrop(g.dy);
        },
        onPanResponderTerminate: () => setOffset(0),
        onPanResponderTerminationRequest: () => false,
      }),
    [disabled, onDrop],
  );
  return (
    <View
      onLayout={(e) => onHeight(e.nativeEvent.layout.height)}
      style={{
        transform: [{ translateY: offset }],
        zIndex: offset ? 10 : 0,
        opacity: offset ? 0.85 : 1,
      }}
    >
      <Card>
        <View
          {...pan.panHandlers}
          accessibilityLabel={label}
          style={{
            minHeight: 44,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: colors.mint,
            borderRadius: 8,
          }}
        >
          <Txt>☰</Txt>
        </View>
        {children}
      </Card>
    </View>
  );
}
export function CoursesScreen() {
  const { t } = useSession();
  const { select } = useLocalSearchParams<{ select?: string }>();
  const mine = useLoad(golf.mine),
    task = useTask();
  const [publicMode, setPublicMode] = useState(false),
    [query, setQuery] = useState(""),
    [searched, setSearched] = useState(""),
    [results, setResults] = useState<Course[] | null>(null),
    [next, setNext] = useState<number | null>(null);
  const heights = useRef<Record<string, number>>({});
  async function search(offset = 0) {
    await task.run(async () => {
      const q = offset ? searched : query;
      const result = await golf.courses(q, offset);
      setSearched(q);
      setResults((current) =>
        offset ? [...(current ?? []), ...result.courses] : result.courses,
      );
      setNext(result.next_offset);
    });
  }
  async function change(value: Parameters<typeof golf.changeList>[1]) {
    if (!mine.data) return;
    await task.run(async () =>
      mine.setData(await golf.changeList(mine.data!.version, value)),
    );
  }
  function reorder(from: number, to: number) {
    if (!mine.data || from === to || task.busy) return;
    const ids = mine.data.courses.map((c) => c.course_id);
    const [id] = ids.splice(from, 1);
    ids.splice(to, 0, id);
    void change({ action: "reorder", course_ids: ids });
  }
  function drop(from: number, dy: number) {
    if (!mine.data) return;
    let to = from,
      remaining = Math.abs(dy);
    const direction = dy > 0 ? 1 : -1;
    while (to + direction >= 0 && to + direction < mine.data.courses.length) {
      const height =
        (heights.current[mine.data.courses[to + direction].course_id] ?? 250) +
        20;
      if (remaining < height / 2) break;
      remaining -= height;
      to += direction;
    }
    reorder(from, to);
  }
  function courseContents(c: Course, index?: number) {
    const inMine = mine.data?.courses.some(
      (item) => item.course_id === c.course_id,
    );
    return (
      <>
        <Txt style={{ fontSize: 21, lineHeight: 29, fontWeight: "700" }}>
          {c.name}
        </Txt>
        <Txt style={{ color: colors.muted }}>
          {c.region} · {c.segments.length * 9}
          {t("hole")} · {c.segments.map((s) => s.name).join(" / ")}
        </Txt>
        {select === "1" && (
          <Button
            label={t("chooseCourse")}
            testID={"choose-" + c.course_id}
            onPress={() =>
              router.replace({
                pathname: "/round-new",
                params: { course_id: c.course_id },
              })
            }
          />
        )}
        <Button
          label={t("editCourse")}
          secondary
          onPress={() =>
            router.push({
              pathname: "/course-edit",
              params: { id: c.course_id },
            })
          }
        />
        {publicMode ? (
          <Button
            label={inMine ? t("myCourses") : t("addMine")}
            secondary
            disabled={inMine || task.busy || !mine.data}
            testID={"add-" + c.course_id}
            onPress={() =>
              void change({ action: "add", course_id: c.course_id })
            }
          />
        ) : (
          <>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Button
                  label={t("up")}
                  secondary
                  disabled={index === 0 || task.busy}
                  testID={"up-" + c.course_id}
                  onPress={() => reorder(index!, index! - 1)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label={t("down")}
                  secondary
                  disabled={
                    index === mine.data!.courses.length - 1 || task.busy
                  }
                  onPress={() => reorder(index!, index! + 1)}
                />
              </View>
            </View>
            <Button
              label={t("removeMine")}
              secondary
              disabled={task.busy}
              onPress={() =>
                void confirm(
                  t("removeMineHelp"),
                  t("removeMine"),
                  t("cancel"),
                ).then((yes) => {
                  if (yes)
                    void change({ action: "remove", course_id: c.course_id });
                })
              }
            />
          </>
        )}
      </>
    );
  }
  const visible = publicMode ? results : mine.data?.courses;
  return (
    <>
      <Heading title={t(select === "1" ? "selectCourse" : "courses")} />
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Button
            label={t("myCourses")}
            secondary={publicMode}
            onPress={() => setPublicMode(false)}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label={t("publicCourses")}
            secondary={!publicMode}
            testID="public-courses"
            onPress={() => {
              setPublicMode(true);
              if (!results) void search();
            }}
          />
        </View>
      </View>
      <Problem text={task.errorText || mine.errorText} />
      {publicMode ? (
        <>
          <Field
            label={t("searchHint")}
            value={query}
            onChangeText={setQuery}
            testID="course-search"
            onSubmitEditing={() => void search()}
          />
          <Button
            label={t("search")}
            busy={task.busy}
            onPress={() => void search()}
          />
        </>
      ) : (
        <>
          <Txt style={{ color: colors.muted }}>{t("sortHint")}</Txt>
          <Button
            label={t("refresh")}
            secondary
            onPress={() => void mine.reload()}
          />
        </>
      )}
      <Button
        label={t("newCourse")}
        testID="new-course"
        onPress={() => router.push("/course-edit")}
      />
      {!visible ? (
        <Txt>{t("loading")}</Txt>
      ) : visible.length === 0 ? (
        <Txt>{t("noCourses")}</Txt>
      ) : (
        visible.map((c, i) =>
          publicMode ? (
            <Card key={c.course_id}>{courseContents(c)}</Card>
          ) : (
            <DragRow
              key={c.course_id}
              label={t("drag") + " " + c.name}
              disabled={task.busy}
              onDrop={(dy) => drop(i, dy)}
              onHeight={(height) => {
                heights.current[c.course_id] = height;
              }}
            >
              {courseContents(c, i)}
            </DragRow>
          ),
        )
      )}
      {publicMode && next !== null && (
        <Button
          label={t("more")}
          busy={task.busy}
          onPress={() => void search(next)}
        />
      )}
    </>
  );
}
export function CourseEditor() {
  const { t } = useSession();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const task = useTask(),
    loaded = useLoad(async () => (id ? (await golf.course(id)).course : null));
  const [draft, setDraft] = useState<Course | null>(null),
    [original, setOriginal] = useState(""),
    [done, setDone] = useState(false);
  const [createId] = useState(() => Crypto.randomUUID());
  const current = draft ??
    loaded.data ?? {
      course_id: createId,
      name: "",
      region: "",
      version: 0,
      segments: [{ name: "OUT", pars: Array(9).fill(4) }],
    };
  const dirty = !!draft && !done && JSON.stringify(draft) !== original;
  useDraftGuard(dirty);
  function edit(c: Course) {
    if (!draft) setOriginal(JSON.stringify(current));
    setDraft(c);
    setDone(false);
  }
  const canSave =
    !!current.name.trim() &&
    current.segments.every((s) => s.name.trim()) &&
    (!id || !!loaded.data);
  async function save() {
    await task.run(async () => {
      const { course } = await golf.saveCourse(current, !id);
      setDraft(course);
      setOriginal(JSON.stringify(course));
      setDone(true);
    });
  }
  return (
    <>
      <Heading title={t(id ? "editCourse" : "newCourse")} />
      <Txt style={{ color: colors.muted }}>{t("sharedHelp")}</Txt>
      <Problem text={task.errorText || loaded.errorText} />
      {id && !loaded.data ? (
        <Button label={t("retry")} onPress={() => void loaded.reload()} />
      ) : (
        <>
          <Field
            label={t("courseName")}
            testID="course-name"
            value={current.name}
            onChangeText={(name) => edit({ ...current, name })}
            maxLength={80}
            editable={!task.busy && !done}
          />
          <Field
            label={t("region")}
            testID="course-region"
            value={current.region}
            onChangeText={(region) => edit({ ...current, region })}
            maxLength={80}
            editable={!task.busy && !done}
          />
          <Txt>{t("segmentHint")}</Txt>
          {current.segments.map((segment, i) => (
            <Card key={i}>
              <Field
                label={`${i + 1}. ${t("segmentName")}`}
                testID={"segment-" + i}
                value={segment.name}
                editable={!task.busy && !done}
                maxLength={30}
                onChangeText={(name) =>
                  edit({
                    ...current,
                    segments: current.segments.map((s, j) =>
                      j === i ? { ...s, name } : s,
                    ),
                  })
                }
              />
              <View style={{ gap: 6 }}>
                {segment.pars.map((par, h) => (
                  <View
                    key={h}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <Txt>
                      {h + 1} {t("hole")} · PAR {par}
                    </Txt>
                    <View style={styles.row}>
                      {[-1, 1].map((delta) => (
                        <Pressable
                          key={delta}
                          accessibilityRole="button"
                          accessibilityLabel={`${segment.name} ${h + 1} PAR ${delta > 0 ? "+" : "−"}`}
                          disabled={
                            task.busy ||
                            done ||
                            par + delta < 3 ||
                            par + delta > 7
                          }
                          onPress={() =>
                            edit({
                              ...current,
                              segments: current.segments.map((s, j) =>
                                j === i
                                  ? {
                                      ...s,
                                      pars: s.pars.map((p, k) =>
                                        k === h ? p + delta : p,
                                      ),
                                    }
                                  : s,
                              ),
                            })
                          }
                          style={{
                            width: 46,
                            height: 46,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: colors.mint,
                            borderRadius: 9,
                            opacity:
                              par + delta < 3 || par + delta > 7 ? 0.35 : 1,
                          }}
                        >
                          <Txt>{delta > 0 ? "+" : "−"}</Txt>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
              {current.segments.length > 1 && !done && (
                <Button
                  label={t("removeSegment")}
                  secondary
                  disabled={task.busy}
                  onPress={() =>
                    edit({
                      ...current,
                      segments: current.segments.filter((_, j) => i !== j),
                    })
                  }
                />
              )}
            </Card>
          ))}
          {current.segments.length < 9 && !done && (
            <Button
              label={t("addSegment")}
              secondary
              disabled={task.busy}
              onPress={() =>
                edit({
                  ...current,
                  segments: [
                    ...current.segments,
                    {
                      name: `COURSE ${current.segments.length + 1}`,
                      pars: Array(9).fill(4),
                    },
                  ],
                })
              }
            />
          )}
          {task.error === "course_changed" && (
            <>
              <Txt>{t("courseConflict")}</Txt>
              <Button
                label={t("loadLatest")}
                secondary
                onPress={() =>
                  void confirm(
                    t("loadLatestConfirm"),
                    t("loadLatest"),
                    t("cancel"),
                  ).then((yes) => {
                    if (yes)
                      void task.run(async () => {
                        const { course } = await golf.course(id!);
                        setDraft(course);
                        setOriginal(JSON.stringify(course));
                      });
                  })
                }
              />
            </>
          )}
          {done ? (
            <>
              <Txt accessibilityRole="alert">{t("saved")}</Txt>
              <Button
                label={t("back")}
                testID="course-done"
                onPress={() => router.back()}
              />
            </>
          ) : (
            <Button
              label={t("save")}
              testID="save-course"
              busy={task.busy}
              disabled={!canSave}
              onPress={() => void save()}
            />
          )}
        </>
      )}
    </>
  );
}
