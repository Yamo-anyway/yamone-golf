import {
  initialHole,
  scoreAt,
  type ScoreSheet,
  type ScoreWrite,
  type ScoreConflict,
} from "../../shared/scores";
export type Draft = {
  deleting?: boolean;
  sheet: ScoreSheet;
  hole: number;
  rows: { slot_id: string; strokes: number; edited: boolean }[];
};
export function draftFor(sheet: ScoreSheet, hole: number): Draft {
  const par = sheet.course.segments.flatMap((s) => s.pars)[hole - 1];
  return {
    sheet: { ...sheet, scores: sheet.scores.filter((s) => s.hole === hole) },
    hole,
    rows: sheet.slot_ids.map((slot_id) => ({
      slot_id,
      strokes: scoreAt(sheet, slot_id, hole).strokes ?? par,
      edited: false,
    })),
  };
}
export type Queued = {
  write: ScoreWrite;
  draft: Draft;
  state: "queued" | "conflict" | "blocked";
  error?: string;
  conflicts?: ScoreConflict[];
  latest?: ScoreSheet;
};
export type LocalRound = {
  sheet: ScoreSheet;
  lastHole: number;
  cachedAt: number;
  drafts: Record<string, Draft>;
  queue: Record<string, Queued>;
};
export type OfflineData = {
  schema: 1;
  user: string;
  rounds: Record<string, LocalRound>;
};
export type OfflineSnapshot = {
  ready: boolean;
  data: OfflineData;
  error: string;
  syncing: boolean;
};
type Storage = {
  exclusive?: <T>(fn: () => Promise<T>) => Promise<T>;
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};
type Transport = {
  get: (round: string, user: string) => Promise<ScoreSheet>;
  save: (round: string, write: ScoreWrite) => Promise<{ sheet: ScoreSheet }>;
};
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
export const offlineKey = (user: string) => "ymg:score-offline:v1:" + user;
export const errorCode = (e: unknown) =>
  typeof e === "object" && e !== null && "code" in e
    ? String(e.code)
    : "storage";
function readData(raw: string, user: string): OfflineData {
  try {
    const d = JSON.parse(raw) as OfflineData;
    const validSheet = (s: ScoreSheet) =>
      s &&
      typeof s.round_id === "string" &&
      ["active", "ended"].includes(s.status) &&
      [9, 18].includes(s.hole_count) &&
      Array.isArray(s.players) &&
      s.players.every(
        (p) => typeof p.slot_id === "string" && typeof p.name === "string",
      ) &&
      Array.isArray(s.slot_ids) &&
      s.slot_ids.every((id) => typeof id === "string") &&
      Array.isArray(s.scores) &&
      s.scores.every(
        (x) =>
          typeof x.slot_id === "string" &&
          Number.isInteger(x.hole) &&
          Number.isSafeInteger(x.version) &&
          (x.strokes === null || Number.isInteger(x.strokes)),
      ) &&
      Array.isArray(s.course?.segments) &&
      s.course.segments.length * 9 === s.hole_count &&
      s.course.segments.every(
        (x) =>
          Array.isArray(x.pars) &&
          x.pars.length === 9 &&
          x.pars.every((p) => Number.isInteger(p) && p >= 3 && p <= 7),
      );
    const validDraft = (v: Draft) =>
      v &&
      validSheet(v.sheet) &&
      Number.isInteger(v.hole) &&
      v.hole >= 1 &&
      v.hole <= v.sheet.hole_count &&
      Array.isArray(v.rows) &&
      v.rows.every(
        (r) =>
          typeof r.slot_id === "string" &&
          Number.isInteger(r.strokes) &&
          r.strokes >= 1 &&
          r.strokes <= 999 &&
          typeof r.edited === "boolean",
      );
    if (
      d.schema !== 1 ||
      d.user !== user ||
      !d.rounds ||
      typeof d.rounds !== "object" ||
      Array.isArray(d.rounds)
    )
      throw Error();
    for (const [id, r] of Object.entries(d.rounds)) {
      if (
        !validSheet(r.sheet) ||
        r.sheet.round_id !== id ||
        !Number.isInteger(r.lastHole) ||
        r.lastHole < 1 ||
        r.lastHole > r.sheet.hole_count ||
        !r.drafts ||
        !r.queue ||
        Array.isArray(r.drafts) ||
        Array.isArray(r.queue)
      )
        throw Error();
      if (
        Object.entries(r.drafts).some(
          ([h, v]) => !validDraft(v) || Number(h) !== v.hole,
        )
      )
        throw Error();
      if (
        Object.entries(r.queue).some(
          ([h, q]) =>
            !q ||
            !validDraft(q.draft) ||
            !["queued", "conflict", "blocked"].includes(q.state) ||
            typeof q.write?.mutation_id !== "string" ||
            q.write.user_id !== user ||
            Number(h) !== q.write.hole ||
            !Array.isArray(q.write.entries) ||
            q.write.entries.some(
              (e) =>
                typeof e.slot_id !== "string" ||
                !Number.isSafeInteger(e.version) ||
                (e.strokes !== null &&
                  (!Number.isInteger(e.strokes) ||
                    e.strokes < 1 ||
                    e.strokes > 999)),
            ) ||
            (q.state === "conflict" &&
              (!Array.isArray(q.conflicts) || !validSheet(q.latest!))),
        )
      )
        throw Error();
    }
    return d;
  } catch {
    throw { code: "offline_corrupt" };
  }
}
export class OfflineScores {
  private value: OfflineSnapshot;
  private listeners = new Set<() => void>();
  private lane: Promise<unknown> = Promise.resolve();
  private opened: Promise<void> | null = null;
  private syncing: Promise<void> | null = null;
  private reads: Record<string, number> = {};
  public enabled = true;
  constructor(
    public readonly user: string,
    private storage: Storage,
    private transport: Transport,
    private uuid: () => string,
    private clock = Date.now,
  ) {
    this.value = {
      ready: false,
      data: { schema: 1, user, rounds: {} },
      error: "",
      syncing: false,
    };
  }
  snapshot = () => this.value;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<OfflineSnapshot>) {
    this.value = { ...this.value, ...patch };
    this.listeners.forEach((fn) => fn());
  }
  async open() {
    if (!this.opened)
      this.opened = (async () => {
        try {
          const raw = await this.storage.getItem(offlineKey(this.user));
          const data = raw ? readData(raw, this.user) : this.value.data;
          this.publish({ ready: true, data, error: "" });
        } catch (e) {
          this.opened = null;
          this.publish({
            error:
              errorCode(e) === "offline_corrupt"
                ? "offline_corrupt"
                : "storage",
          });
          throw e;
        }
      })();
    return this.opened;
  }
  private mutate(fn: (data: OfflineData) => void) {
    const work = async () => {
      await this.open();
      const raw = await this.storage.getItem(offlineKey(this.user));
      const data = clone(raw ? readData(raw, this.user) : this.value.data);
      fn(data);
      try {
        await this.storage.setItem(offlineKey(this.user), JSON.stringify(data));
      } catch {
        this.publish({ error: "offline_storage" });
        throw { code: "offline_storage" };
      }
      this.publish({ data, error: "" });
    };
    const result = this.lane.then(() =>
      this.storage.exclusive ? this.storage.exclusive(work) : work(),
    );
    this.lane = result.catch(() => {});
    return result;
  }
  async reloadLocal() {
    await this.lane;
    await this.open();
    try {
      const raw = await this.storage.getItem(offlineKey(this.user));
      if (raw) this.publish({ data: readData(raw, this.user) });
    } catch (e) {
      this.publish({ error: errorCode(e) });
    }
  }
  private require(data: OfflineData, round: string) {
    const r = data.rounds[round];
    if (!r) throw { code: "offline_unavailable" };
    return r;
  }
  private putSheet(data: OfflineData, sheet: ScoreSheet) {
    const old = data.rounds[sheet.round_id];
    data.rounds[sheet.round_id] = old
      ? { ...old, sheet, cachedAt: this.clock() }
      : {
          sheet,
          lastHole: initialHole(sheet, null),
          cachedAt: this.clock(),
          drafts: {},
          queue: {},
        };
  }
  async refresh(round: string) {
    await this.open();
    const serial = (this.reads[round] = (this.reads[round] ?? 0) + 1);
    try {
      const sheet = await this.transport.get(round, this.user);
      if (serial !== this.reads[round]) return;
      await this.mutate((data) => {
        if (serial === this.reads[round]) this.putSheet(data, sheet);
      });
    } catch (e) {
      this.publish({ error: errorCode(e) });
      throw e;
    }
  }
  async visit(round: string, hole: number) {
    await this.mutate((data) => {
      const r = this.require(data, round);
      if (hole < 1 || hole > r.sheet.hole_count)
        throw { code: "invalid_score" };
      r.lastHole = hole;
    });
  }
  async change(round: string, hole: number, slot: string, delta: number) {
    await this.mutate((data) => {
      const r = this.require(data, round);
      if (r.queue[hole]) throw { code: "score_pending_locked" };
      if (r.sheet.status !== "active") throw { code: "round_ended" };
      const d = r.drafts[hole] ?? draftFor(r.sheet, hole),
        row = d.rows.find((x) => x.slot_id === slot);
      if (!row) throw { code: "invalid_score" };
      row.strokes = Math.max(1, Math.min(999, row.strokes + delta));
      const before = scoreAt(d.sheet, slot, hole).strokes;
      row.edited = before === null || before !== row.strokes;
      if (d.rows.some((x) => x.edited)) r.drafts[hole] = d;
      else delete r.drafts[hole];
      r.lastHole = hole;
    });
  }
  async discard(round: string, hole: number) {
    await this.mutate((data) => {
      delete this.require(data, round).drafts[hole];
    });
  }
  async enqueue(round: string, hole: number, remove = false) {
    await this.mutate((data) => {
      const r = this.require(data, round);
      if (r.queue[hole]) return;
      if (r.sheet.status !== "active") throw { code: "round_ended" };
      const draft = r.drafts[hole] ?? draftFor(r.sheet, hole);
      if (!draft.rows.length) throw { code: "invalid_targets" };
      const write: ScoreWrite = {
        user_id: this.user,
        mutation_id: this.uuid(),
        hole,
        roster_version: draft.sheet.roster_version,
        target_version: draft.sheet.target_version,
        entries: draft.rows.map((row) => ({
          slot_id: row.slot_id,
          strokes: remove || draft.deleting ? null : row.strokes,
          version: scoreAt(draft.sheet, row.slot_id, hole).version,
        })),
      };
      r.queue[hole] = { write, draft, state: "queued" };
      delete r.drafts[hole];
    });
  }
  pending() {
    return Object.values(this.value.data.rounds).some((r) =>
      Object.values(r.queue).some((q) => q.state === "queued"),
    );
  }
  sync() {
    if (this.syncing) return this.syncing;
    this.syncing = this.send().finally(() => {
      this.syncing = null;
      this.publish({ syncing: false });
    });
    return this.syncing;
  }
  private async send() {
    await this.open();
    if (!this.enabled) return;
    this.publish({ syncing: true });
    // One immutable request per hole; a blocked hole does not hold up other holes.
    for (const round of Object.keys(this.value.data.rounds))
      for (const hole of Object.keys(this.value.data.rounds[round].queue)) {
        if (!this.enabled) return;
        const item = this.value.data.rounds[round].queue[hole];
        if (!item || item.state !== "queued") continue;
        this.reads[round] = (this.reads[round] ?? 0) + 1;
        try {
          const result = await this.transport.save(round, item.write);
          this.reads[round] = (this.reads[round] ?? 0) + 1;
          await this.mutate((data) => {
            const r = this.require(data, round);
            if (r.queue[hole]?.write.mutation_id !== item.write.mutation_id)
              return;
            this.putSheet(data, result.sheet);
            delete data.rounds[round].queue[hole];
          });
        } catch (e) {
          const code = errorCode(e),
            status =
              typeof e === "object" && e !== null && "status" in e
                ? Number(e.status)
                : 0;
          // If local acknowledgement fails, leave the exact request durable for replay.
          if (code === "offline_storage") return;
          const transient =
            code === "network" || status >= 500 || status === 429;
          await this.mutate((data) => {
            const current = this.require(data, round).queue[hole];
            if (current?.write.mutation_id !== item.write.mutation_id) return;
            current.error = code;
            if (code === "round_ended")
              this.require(data, round).sheet.status = "ended";
            if (code === "score_conflict") {
              const details = (
                e as {
                  details: { conflicts: ScoreConflict[]; sheet: ScoreSheet };
                }
              ).details;
              current.state = "conflict";
              current.conflicts = details.conflicts;
              current.latest = details.sheet;
              this.putSheet(data, details.sheet);
            } else if (!transient) current.state = "blocked";
          });
          this.publish({ error: code });
          if (
            transient ||
            ["device_moved", "unauthorized", "user_changed"].includes(code)
          )
            return;
        }
      }
  }
  async confirm(round: string, hole: number) {
    await this.mutate((data) => {
      const r = this.require(data, round),
        q = r.queue[hole];
      if (!q || q.state !== "conflict") throw { code: "state_changed" };
      const versions = new Map(q.conflicts!.map((c) => [c.slot_id, c.version]));
      q.write = {
        ...q.write,
        mutation_id: this.uuid(),
        entries: q.write.entries.map((e) => ({
          ...e,
          version: versions.get(e.slot_id) ?? e.version,
        })),
      };
      q.state = "queued";
      delete q.conflicts;
      delete q.error;
    });
  }
  async reject(round: string, hole: number) {
    await this.mutate((data) => {
      const r = this.require(data, round),
        q = r.queue[hole];
      if (!q || q.state !== "conflict") throw { code: "state_changed" };
      const d = q.draft,
        byId = new Map(q.conflicts!.map((c) => [c.slot_id, c]));
      d.sheet.scores = [
        ...d.sheet.scores.filter((s) => !byId.has(s.slot_id)),
        ...q.conflicts!.map((c) => ({
          slot_id: c.slot_id,
          hole,
          strokes: c.strokes,
          version: c.version,
        })),
      ];
      const par = d.sheet.course.segments.flatMap((s) => s.pars)[hole - 1];
      d.rows = d.rows.map((row) => {
        const c = byId.get(row.slot_id);
        return c ? { ...row, strokes: c.strokes ?? par, edited: false } : row;
      });
      delete r.queue[hole];
      if (d.rows.some((x) => x.edited)) r.drafts[hole] = d;
    });
  }
  async reprepare(round: string, hole: number) {
    await this.mutate((data) => {
      const r = this.require(data, round),
        q = r.queue[hole];
      if (
        q?.state !== "blocked" ||
        !["targets_changed", "state_changed"].includes(q.error ?? "") ||
        r.sheet.status !== "active"
      )
        throw { code: "state_changed" };
      // UI explicitly reviews excluded players. Overlapping values keep old score versions so later saves still conflict.
      const d = draftFor(r.sheet, hole);
      d.deleting = q.write.entries.every((e) => e.strokes === null);
      d.rows = d.rows.map((row) => {
        const old = q.draft.rows.find((x) => x.slot_id === row.slot_id);
        if (!old) return row;
        const before = scoreAt(q.draft.sheet, row.slot_id, hole);
        d.sheet.scores = d.sheet.scores.filter(
          (s) => s.slot_id !== row.slot_id,
        );
        d.sheet.scores.push(before);
        return { ...old, edited: true };
      });
      r.drafts[hole] = d;
      delete r.queue[hole];
    });
  }
}
