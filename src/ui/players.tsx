import React, { useRef, useState } from "react";
import { Platform, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import {
  players,
  type DeleteImpact,
  type Player,
  type PlayerLookup,
  type TargetPlayer,
  type Roster,
  type SlotChange,
  type Targets,
} from "../data/players";
import { normalizePersonalCode } from "../../shared/personal-code";
import { ApiError } from "../data/api";
import { useSession } from "./session";
import { Button, Card, colors, Field, styles, Txt } from "./components";
import { Heading, Problem } from "./courses";
import { confirm, useDraftGuard, useLoad, useTask } from "./golf-hooks";
import { DragRow } from "./drag-row";
import { QRScanner } from "./qr-scanner";
function useMutationId() {
  const pending = useRef<{ body: string; id: string } | null>(null);
  return (body: unknown) => {
    const serialized = JSON.stringify(body);
    if (pending.current?.body !== serialized)
      pending.current = { body: serialized, id: Crypto.randomUUID() };
    return pending.current.id;
  };
}
function PlayerLabel({ player }: { player: TargetPlayer }) {
  const { t } = useSession();
  return (
    <View style={{ gap: 4 }}>
      <Txt style={{ fontSize: 20, lineHeight: 28, fontWeight: "700" }}>
        {player.name}
      </Txt>
      <Txt style={{ color: colors.muted, fontSize: 14 }}>
        {t(player.user_id ? "linkedPlayer" : "unregistered")}
        {player.personal_code ? " · " + player.personal_code : ""}
      </Txt>
    </View>
  );
}
function PlayerEditor({
  round,
  initial,
  onSave,
  onClose,
  active,
}: {
  round: string;
  initial: Player | null;
  active: boolean;
  onSave: (data: Roster) => void;
  onClose: () => void;
}) {
  const { t, profile } = useSession(),
    task = useTask();
  const makeId = useMutationId();
  const [mode, setMode] = useState<"name" | "link" | "unlink" | "delete">(
    initial?.user_id ? "unlink" : "name",
  );
  const [name, setName] = useState(initial?.name ?? ""),
    [code, setCode] = useState(""),
    [lookup, setLookup] = useState<PlayerLookup | null>(null),
    [scan, setScan] = useState(false),
    [impact, setImpact] = useState<DeleteImpact | null>(null);
  const [baseline, setBaseline] = useState(initial),
    [saved, setSaved] = useState(false);
  const blocked =
    task.busy || (!active && !(mode === "name" && !baseline?.user_id));
  const dirty = !saved && (name !== (baseline?.name ?? "") || !!code);
  useDraftGuard(dirty);
  async function find(value = code) {
    await task.run(async () => {
      const normalized = normalizePersonalCode(value);
      if (!normalized) throw new ApiError("invalid_personal_code");
      setLookup(await players.lookup(round, normalized));
      setCode(normalized);
    });
  }
  async function saveChange(change: SlotChange) {
    if (!baseline) return;
    const data = await players.change(
      round,
      baseline.slot_id,
      baseline.version,
      change,
      makeId([baseline.slot_id, baseline.version, change]),
    );
    setSaved(true);
    onSave(data);
  }
  async function reviewDelete() {
    if (!baseline) return;
    await task.run(async () => {
      const result = await players.impact(round, baseline.slot_id);
      if (result.version !== baseline.version)
        throw new ApiError("player_changed");
      setImpact(result);
      setMode("delete");
    });
  }
  const conflict = [
    "player_changed",
    "player_link_changed",
    "delete_changed",
    "player_limit",
  ].includes(task.error);
  return (
    <Card>
      <Txt style={{ fontSize: 22, lineHeight: 30, fontWeight: "700" }}>
        {baseline ? baseline.name : t("addPlayer")}
      </Txt>
      <Problem text={task.errorText} />
      {baseline && (
        <View style={{ gap: 8 }}>
          {!baseline.user_id && (
            <Button
              label={t("renamePlayer")}
              secondary={mode !== "name"}
              disabled={task.busy}
              onPress={() => setMode("name")}
            />
          )}
          <Button
            label={t(baseline.user_id ? "unlinkPlayer" : "linkPlayer")}
            secondary={mode !== (baseline.user_id ? "unlink" : "link")}
            disabled={task.busy || !active}
            onPress={() => setMode(baseline.user_id ? "unlink" : "link")}
          />
          <Button
            label={t("deletePlayer")}
            testID="review-delete-player"
            secondary
            disabled={task.busy || !active}
            onPress={() => void reviewDelete()}
          />
        </View>
      )}
      {(mode === "name" || mode === "unlink") && (
        <>
          {mode === "unlink" && <Txt>{t("unlinkHelp")}</Txt>}
          <Field
            label={t(!baseline ? "addPlayerName" : "temporaryName")}
            testID="player-name"
            value={name}
            maxLength={16}
            editable={!blocked}
            onChangeText={setName}
          />
          <Button
            label={t(mode === "unlink" ? "unlinkPlayer" : "savePlayer")}
            testID="save-player"
            busy={task.busy}
            disabled={!name.trim() || blocked}
            onPress={() =>
              void task.run(async () => {
                if (
                  mode === "unlink" &&
                  !(await confirm(
                    t("unlinkConfirm"),
                    t("unlinkPlayer"),
                    t("cancel"),
                  ))
                )
                  return;
                if (!baseline) {
                  const data = await players.add(
                    round,
                    name,
                    makeId(["add", name]),
                  );
                  setSaved(true);
                  onSave(data);
                } else
                  await saveChange({
                    action: mode === "unlink" ? "unlink" : "rename",
                    name,
                  });
              })
            }
          />
        </>
      )}
      {mode === "link" && (
        <>
          <Txt>{t("linkHelp")}</Txt>
          <Field
            label={t("playerCode")}
            testID="player-code"
            value={code}
            editable={!blocked}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={180}
            onChangeText={(value) => {
              setCode(value);
              setLookup(null);
            }}
          />
          <Button
            label={t("findPlayer")}
            testID="find-player"
            busy={task.busy}
            disabled={!code.trim() || blocked}
            onPress={() => void find()}
          />
          <Button
            label={t("linkSelf")}
            secondary
            disabled={blocked}
            onPress={() => void find(profile!.personal_code)}
          />
          {Platform.OS !== "web" && (
            <Button
              label={t("qrScan")}
              secondary
              disabled={blocked}
              onPress={() => setScan(true)}
            />
          )}
          {scan && (
            <QRScanner
              onClose={() => setScan(false)}
              onCode={(value) => {
                setScan(false);
                setCode(value);
                setLookup(null);
                void find(value);
              }}
            />
          )}
          {lookup && (
            <View
              style={{
                gap: 12,
                padding: 14,
                backgroundColor: colors.mint,
                borderRadius: 12,
              }}
            >
              <Txt style={{ fontWeight: "700" }}>{lookup.user.nickname}</Txt>
              <Txt selectable testID="resolved-player-code">
                {lookup.user.personal_code}
              </Txt>
              {lookup.linked_slot_id ? (
                <Txt>{t("user_already_player")}</Txt>
              ) : (
                <Button
                  label={t("confirmLink")}
                  testID="confirm-player-link"
                  disabled={blocked}
                  busy={task.busy}
                  onPress={() =>
                    void task.run(() =>
                      saveChange({
                        action: "link",
                        code: lookup.user.personal_code,
                        confirmed_user_id: lookup.user.user_id,
                      }),
                    )
                  }
                />
              )}
            </View>
          )}
        </>
      )}
      {mode === "delete" && impact && (
        <>
          <Txt style={{ fontWeight: "700" }}>{t("deleteImpact")}</Txt>
          <Txt>{t(impact.linked ? "linkedPlayer" : "unregistered")}</Txt>
          <Txt>
            {t("scoreCount")}: {impact.score_count}
          </Txt>
          <Txt>
            {t("deliveryCount")}: {impact.delivery_count}
          </Txt>
          <Txt>
            {t("receiptCount")}: {impact.receipt_count}
          </Txt>
          <Txt>
            {t("targetCount")}: {impact.target_count}
          </Txt>
          {!impact.can_delete ? (
            <Txt>
              {t(
                impact.player_count <= 1
                  ? "lastPlayerHelp"
                  : "deleteImpactHelp",
              )}
            </Txt>
          ) : (
            <>
              <Txt>{t("deleteTargetHelp")}</Txt>
              <Button
                label={t("confirmDeletePlayer")}
                testID="confirm-delete-player"
                disabled={blocked}
                busy={task.busy}
                onPress={() =>
                  void task.run(async () => {
                    const data = await players.remove(
                      round,
                      baseline!.slot_id,
                      impact,
                      makeId(["delete", baseline!.slot_id, impact]),
                    );
                    setSaved(true);
                    onSave(data);
                  })
                }
              />
            </>
          )}
        </>
      )}
      {conflict && baseline && (
        <>
          <Txt>{t("playerDraftChanged")}</Txt>
          <Button
            label={t("reloadPlayers")}
            secondary
            disabled={task.busy}
            onPress={() =>
              void confirm(
                t("reloadDraftConfirm"),
                t("reloadPlayers"),
                t("keepEditing"),
              ).then((yes) => {
                if (yes)
                  void task.run(async () => {
                    const data = await players.roster(round);
                    const updated = data.players.find(
                      (p) => p.slot_id === baseline.slot_id,
                    );
                    if (!updated) throw new ApiError("player_not_found");
                    setBaseline(updated);
                    setName(updated.name);
                    setCode("");
                    setLookup(null);
                    setImpact(null);
                    setMode(updated.user_id ? "unlink" : "name");
                  });
              })
            }
          />
        </>
      )}
      <Button
        label={t("cancel")}
        testID="cancel-player-edit"
        secondary
        disabled={task.busy}
        onPress={() => {
          if (dirty)
            void confirm(
              t("roundUnsaved"),
              t("discard"),
              t("keepEditing"),
            ).then((yes) => {
              if (yes) onClose();
            });
          else onClose();
        }}
      />
    </Card>
  );
}
export function PlayersScreen() {
  const { t } = useSession(),
    { id } = useLocalSearchParams<{ id: string }>();
  const query = useLoad(() => players.roster(id));
  const [editor, setEditor] = useState<{ player: Player | null } | null>(null),
    [saved, setSaved] = useState(false);
  const roster = query.data,
    active = roster?.status === "active";
  return (
    <>
      <Heading title={t("playerManagement")} />
      <Txt>{t("recorderHelp")}</Txt>
      <Problem text={query.errorText} />
      {saved && <Txt accessibilityRole="alert">{t("saved")}</Txt>}
      {editor && roster && (
        <PlayerEditor
          active={!!active}
          key={editor.player?.slot_id ?? "new"}
          round={id}
          initial={editor.player}
          onClose={() => setEditor(null)}
          onSave={(data) => {
            query.setData(data);
            setEditor(null);
            setSaved(true);
          }}
        />
      )}
      {roster && !active && <Txt>{t("playersReadOnly")}</Txt>}
      {roster?.players.map((p, i) => (
        <Card key={p.slot_id}>
          <Txt style={{ color: colors.muted }}>
            {t("player")} {i + 1}
          </Txt>
          <PlayerLabel player={p} />
          <Button
            label={t("managePlayer")}
            testID={"manage-" + p.slot_id}
            secondary
            disabled={(!active && !!p.user_id) || !!editor}
            onPress={() => {
              setSaved(false);
              setEditor({ player: p });
            }}
          />
        </Card>
      ))}
      <Button
        label={t("addPlayer")}
        testID="add-slot"
        disabled={!active || !!editor || !roster || roster.players.length >= 8}
        onPress={() => {
          setSaved(false);
          setEditor({ player: null });
        }}
      />
      <Button
        label={t("refresh")}
        testID="refresh-players"
        secondary
        onPress={() => void query.reload()}
      />
    </>
  );
}
export function TargetsScreen() {
  const { t } = useSession(),
    { id } = useLocalSearchParams<{ id: string }>();
  const query = useLoad(() => players.targets(id)),
    task = useTask();
  const makeId = useMutationId();
  const [draft, setDraft] = useState<Targets | null>(null),
    [saved, setSaved] = useState(false);
  const heights = useRef<Record<string, number>>({});
  useDraftGuard(!!draft);
  const current = draft ?? query.data,
    active = query.data?.status === "active";
  function change(ids: string[]) {
    if (!current || task.busy || !active) return;
    setDraft({ ...current, slot_ids: ids });
    setSaved(false);
  }
  function move(from: number, to: number) {
    if (!current || from === to || to < 0 || to >= current.slot_ids.length)
      return;
    const ids = [...current.slot_ids];
    const [s] = ids.splice(from, 1);
    ids.splice(to, 0, s);
    change(ids);
  }
  function drop(from: number, dy: number) {
    if (!current) return;
    let to = from,
      remaining = Math.abs(dy);
    const direction = dy > 0 ? 1 : -1;
    while (to + direction >= 0 && to + direction < current.slot_ids.length) {
      const height =
        (heights.current[current.slot_ids[to + direction]] ?? 200) + 20;
      if (remaining < height / 2) break;
      remaining -= height;
      to += direction;
    }
    move(from, to);
  }
  async function reloadDraft() {
    if (
      draft &&
      !(await confirm(
        t("reloadDraftConfirm"),
        t("loadLatest"),
        t("keepEditing"),
      ))
    )
      return;
    await task.run(async () => {
      const data = await players.targets(id);
      query.setData(data);
      setDraft(null);
      setSaved(false);
    });
  }
  const stale =
    !!draft &&
    !!query.data &&
    (draft.roster_version !== query.data.roster_version ||
      draft.version !== query.data.version);
  return (
    <>
      <Heading title={t("inputTargets")} />
      <Txt>{t("targetsHelp")}</Txt>
      <Problem text={task.errorText || query.errorText} />
      {current && (
        <>
          {!active && <Txt>{t("round_ended")}</Txt>}
          <Card>
            <Txt style={{ fontWeight: "700" }}>
              {t("selectedCount")}: {current.slot_ids.length} /{" "}
              {current.players.length}
            </Txt>
            {(draft || saved) && (
              <Txt>{t(draft ? "unsavedTargets" : "targetsSaved")}</Txt>
            )}
            {(stale || task.error === "targets_changed") && (
              <Txt accessibilityRole="alert">{t("targetDraftChanged")}</Txt>
            )}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button
                  label={t("save")}
                  testID="save-targets"
                  busy={task.busy}
                  disabled={!active || !draft}
                  onPress={() =>
                    void task.run(async () => {
                      const value = {
                        version: current.version,
                        roster_version: current.roster_version,
                        slot_ids: current.slot_ids,
                      };
                      query.setData(
                        await players.saveTargets(id, value, makeId(value)),
                      );
                      setDraft(null);
                      setSaved(true);
                    })
                  }
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label={t(draft ? "loadLatest" : "refresh")}
                  secondary
                  testID="refresh-targets"
                  disabled={task.busy}
                  onPress={() => void reloadDraft()}
                />
              </View>
            </View>
          </Card>
          <Txt style={{ fontSize: 22, lineHeight: 30, fontWeight: "700" }}>
            {t("selectedPlayers")}
          </Txt>
          {current.slot_ids.length === 0 && <Txt>{t("noSelectedPlayers")}</Txt>}
          {current.slot_ids.map((slotId, i) => {
            const p = current.players.find((p) => p.slot_id === slotId);
            if (!p) return null;
            return (
              <DragRow
                key={slotId}
                label={t("drag") + " " + p.name}
                disabled={!active || task.busy}
                onHeight={(h) => {
                  heights.current[slotId] = h;
                }}
                onDrop={(dy) => drop(i, dy)}
              >
                <View testID={"selected-" + slotId}>
                  <PlayerLabel player={p} />
                </View>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Button
                      label={t("up")}
                      testID={"target-up-" + slotId}
                      secondary
                      disabled={i === 0 || !active || task.busy}
                      onPress={() => move(i, i - 1)}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      label={t("down")}
                      secondary
                      disabled={
                        i === current.slot_ids.length - 1 ||
                        !active ||
                        task.busy
                      }
                      onPress={() => move(i, i + 1)}
                    />
                  </View>
                </View>
                <Button
                  label={t("unselectPlayer")}
                  testID={"unselect-" + slotId}
                  secondary
                  disabled={!active || task.busy}
                  onPress={() =>
                    change(current.slot_ids.filter((s) => s !== slotId))
                  }
                />
              </DragRow>
            );
          })}
          <Txt style={{ fontSize: 22, lineHeight: 30, fontWeight: "700" }}>
            {t("unselectedPlayers")}
          </Txt>
          {current.slot_ids.length === current.players.length && (
            <Txt>{t("allPlayersSelected")}</Txt>
          )}
          {current.players
            .filter((p) => !current.slot_ids.includes(p.slot_id))
            .map((p) => (
              <Card key={p.slot_id}>
                <PlayerLabel player={p} />
                <Button
                  label={t("selectPlayer")}
                  testID={"select-" + p.slot_id}
                  secondary
                  disabled={!active || task.busy}
                  onPress={() => change([...current.slot_ids, p.slot_id])}
                />
              </Card>
            ))}
          <Txt style={{ color: colors.muted }}>{t("sortHint")}</Txt>
          <Txt style={{ color: colors.muted }}>{t("targetsDefault")}</Txt>
        </>
      )}
    </>
  );
}
