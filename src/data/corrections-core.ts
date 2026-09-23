import type {
  PersonalScoreView,
  PersonalScoreWrite,
  PersonalConflict,
} from "../../shared/personal-records";
export type CorrectionDraft = Pick<
  PersonalScoreWrite,
  "strokes" | "version" | "slot_version"
>;
export type CorrectionState = {
  view: PersonalScoreView | null;
  hole: number;
  drafts: Record<number, CorrectionDraft>;
  pending: {
    write: PersonalScoreWrite;
    state: "unknown" | "conflict" | "blocked";
    conflict?: PersonalConflict;
    error?: string;
  } | null;
  needsRefresh: boolean;
};
export type CorrectionAPI = {
  load: (id: string) => Promise<PersonalScoreView>;
  save: (
    id: string,
    w: PersonalScoreWrite,
  ) => Promise<{ mutation_id: string; replayed: boolean }>;
};
type Storage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, v: string) => Promise<void>;
  exclusive?: <T>(fn: () => Promise<T>) => Promise<T>;
};
type Disk = {
  version: 1;
  user_id: string;
  records: Record<string, CorrectionState>;
};
const empty = (): CorrectionState => ({
  view: null,
  hole: 1,
  drafts: {},
  pending: null,
  needsRefresh: false,
});
export class Corrections {
  readonly key: string;
  private lane: Promise<unknown> = Promise.resolve();
  constructor(
    readonly user: string,
    private storage: Storage,
    private uuid: () => string,
  ) {
    this.key = "ymg:corrections:v1:" + user;
  }
  private async disk(): Promise<Disk> {
    const raw = await this.storage.getItem(this.key);
    if (!raw) return { version: 1, user_id: this.user, records: {} };
    try {
      const d = JSON.parse(raw) as Disk;
      if (
        d.version !== 1 ||
        d.user_id !== this.user ||
        !d.records ||
        typeof d.records !== "object" ||
        Array.isArray(d.records)
      )
        throw Error();
      for (const [id, r] of Object.entries(d.records)) {
        if (
          !r ||
          !r.drafts ||
          typeof r.drafts !== "object" ||
          Array.isArray(r.drafts) ||
          !Number.isInteger(r.hole) ||
          r.hole < 1 ||
          r.hole > 18 ||
          typeof r.needsRefresh !== "boolean"
        )
          throw Error();
        for (const [hole, draft] of Object.entries(r.drafts)) {
          if (
            !Number.isInteger(Number(hole)) ||
            Number(hole) < 1 ||
            Number(hole) > 18 ||
            !draft ||
            (draft.strokes !== null &&
              (!Number.isInteger(draft.strokes) ||
                draft.strokes < 1 ||
                draft.strokes > 999)) ||
            !Number.isSafeInteger(draft.version) ||
            draft.version < 0 ||
            !Number.isSafeInteger(draft.slot_version) ||
            draft.slot_version < 0
          )
            throw Error();
        }
        if (
          r.view &&
          (r.view.user_id !== this.user ||
            r.view.receipt_id !== id ||
            !Array.isArray(r.view.scores))
        )
          throw Error();
        if (
          r.pending &&
          (!["unknown", "conflict", "blocked"].includes(r.pending.state) ||
            r.pending.write?.user_id !== this.user)
        )
          throw Error();
      }
      return d;
    } catch {
      throw { code: "correction_storage_corrupt" };
    }
  }
  private lock<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.lane.then(() =>
      this.storage.exclusive ? this.storage.exclusive(fn) : fn(),
    );
    this.lane = p.catch(() => {});
    return p;
  }
  private persist(d: Disk) {
    return this.storage.setItem(this.key, JSON.stringify(d));
  }
  async read(id: string) {
    return (await this.disk()).records[id] ?? empty();
  }
  async summaries() {
    return Object.entries((await this.disk()).records)
      .filter(([, r]) => r.pending || Object.keys(r.drafts).length)
      .map(([id, r]) => ({
        receipt_id: id,
        course_name: r.view?.course.name ?? "",
        holes: Object.keys(r.drafts).length,
        pending: !!r.pending,
      }));
  }
  refresh(id: string, api: CorrectionAPI) {
    return this.lock(async () => {
      let v: PersonalScoreView;
      try {
        v = await api.load(id);
      } catch (error) {
        if ((error as { code?: string }).code === "record_deleted") {
          const saved = await this.disk(),
            record = saved.records[id];
          if (record?.view) {
            record.view.edit = {
              ...record.view.edit,
              allowed: false,
              reason: "record_deleted",
            };
            await this.persist(saved);
          }
        }
        throw error;
      }
      if (v.user_id !== this.user || v.receipt_id !== id)
        throw { code: "user_changed" };
      const d = await this.disk(),
        old = d.records[id],
        r = old ?? empty();
      if (!old)
        r.hole =
          Array.from({ length: v.hole_count }, (_, i) => i + 1).find(
            (h) => !v.scores.some((s) => s.hole === h && s.strokes !== null),
          ) ?? 1;
      r.view = v;
      r.needsRefresh = false;
      d.records[id] = r;
      await this.persist(d);
      return r;
    });
  }
  private async update(id: string, fn: (r: CorrectionState) => void) {
    return this.lock(async () => {
      const d = await this.disk(),
        r = d.records[id] ?? empty();
      fn(r);
      d.records[id] = r;
      await this.persist(d);
      return r;
    });
  }
  visit(id: string, hole: number) {
    return this.update(id, (r) => {
      if (
        !Number.isInteger(hole) ||
        hole < 1 ||
        hole > (r.view?.hole_count ?? 18)
      )
        throw { code: "invalid_score" };
      r.hole = hole;
    });
  }
  change(id: string, hole: number, strokes: number | null) {
    return this.update(id, (r) => {
      if (!r.view || r.needsRefresh) throw { code: "correction_refresh" };
      if (!r.view.edit.allowed) throw { code: r.view.edit.reason };
      if (
        hole < 1 ||
        hole > r.view.hole_count ||
        !Number.isInteger(hole) ||
        (strokes !== null &&
          (!Number.isInteger(strokes) || strokes < 1 || strokes > 999))
      )
        throw { code: "invalid_score" };
      if (r.pending?.write.hole === hole) throw { code: "correction_pending" };
      const score = r.view.scores.find((s) => s.hole === hole);
      r.drafts[hole] = {
        ...(r.drafts[hole] ?? {
          version: score?.version ?? 0,
          slot_version: r.view.slot_version,
        }),
        strokes,
      };
    });
  }
  discard(id: string, hole: number) {
    return this.update(id, (r) => {
      if (r.pending?.write.hole === hole) {
        if (r.pending.state === "unknown") throw { code: "correction_pending" };
        r.pending = null;
      }
      delete r.drafts[hole];
    });
  }
  reject(id: string) {
    return this.update(id, (r) => {
      const p = r.pending;
      if (!p || p.state !== "conflict" || !p.conflict)
        throw { code: "state_changed" };
      r.view = p.conflict.view;
      r.needsRefresh = false;
      delete r.drafts[p.write.hole];
      r.pending = null;
    });
  }
  send(
    id: string,
    hole: number,
    api: CorrectionAPI,
    mode: "save" | "confirm" | "retry" = "save",
  ) {
    return this.lock(async () => {
      const d = await this.disk(),
        r = d.records[id];
      if (!r?.view) throw { code: "correction_refresh" };
      let w: PersonalScoreWrite;
      if (r.pending) {
        if (r.pending.write.hole !== hole) throw { code: "correction_pending" };
        if (
          mode === "confirm" &&
          r.pending.state === "conflict" &&
          r.pending.conflict
        ) {
          w = {
            ...r.pending.write,
            version: r.pending.conflict.current.version,
            mutation_id: this.uuid(),
          };
        } else if (mode === "retry" && r.pending.state !== "conflict")
          w = r.pending.write;
        else throw { code: "correction_pending" };
      } else {
        if (r.needsRefresh) throw { code: "correction_refresh" };
        if (!r.view.edit.allowed) throw { code: r.view.edit.reason };
        const saved = r.view.scores.find((s) => s.hole === hole),
          par = r.view.course.segments.flatMap((s) => s.pars)[hole - 1];
        if (par === undefined) throw { code: "invalid_score" };
        const draft = r.drafts[hole] ?? {
          strokes: saved?.strokes ?? par,
          version: saved?.version ?? 0,
          slot_version: r.view.slot_version,
        };
        w = {
          ...draft,
          user_id: this.user,
          mutation_id: this.uuid(),
          player_slot_id: r.view.player_slot_id,
          hole,
        };
        r.drafts[hole] = draft;
      }
      r.pending = { write: w, state: "unknown" };
      await this.persist(d);
      try {
        const ack = await api.save(id, w);
        if (ack.mutation_id !== w.mutation_id) throw { code: "server_error" };
        // Clear only after a confirmed server success. If this disk write fails, the
        // durable original request is still available for an idempotent retry.
        const next: CorrectionState = {
          ...r,
          drafts: { ...r.drafts },
          pending: null,
          needsRefresh: true,
        };
        delete next.drafts[hole];
        await this.persist({ ...d, records: { ...d.records, [id]: next } });
        return next;
      } catch (e) {
        const error = e as {
          code?: string;
          status?: number;
          details?: unknown;
        };
        if (error.code === "score_conflict" && error.details) {
          const conflict = error.details as PersonalConflict;
          r.pending = { write: w, state: "conflict", conflict };
        } else if (
          error.status &&
          error.status >= 400 &&
          error.status < 500 &&
          error.status !== 429
        ) {
          r.pending = {
            write: w,
            state: "blocked",
            error: error.code ?? "server_error",
          };
          if (
            ["record_deleted", "record_unlinked", "record_locked"].includes(
              error.code ?? "",
            )
          ) {
            r.view = {
              ...r.view!,
              edit: {
                ...r.view!.edit,
                allowed: false,
                reason: error.code as
                  "record_deleted" | "record_unlinked" | "record_locked",
              },
            };
          } else r.needsRefresh = true;
        }
        await this.persist(d);
        throw e;
      }
    });
  }
}
