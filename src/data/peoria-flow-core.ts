import type { PeoriaWrite, PeoriaAck } from "../../shared/peoria";
export type PendingPeoria = {
  round_id: string;
  write: PeoriaWrite;
  rejected?: string;
};
type Storage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
  exclusive?: <T>(fn: () => Promise<T>) => Promise<T>;
};
type Execute = (round: string, write: PeoriaWrite) => Promise<PeoriaAck>;
export class PeoriaFlow {
  readonly key: string;
  private lane: Promise<unknown> = Promise.resolve();
  constructor(
    readonly user: string,
    private storage: Storage,
    private uuid: () => string,
  ) {
    this.key = "ymg:pending-peoria:v1:" + user;
  }
  async read(): Promise<PendingPeoria | null> {
    const raw = await this.storage.getItem(this.key);
    if (!raw) return null;
    try {
      const p = JSON.parse(raw) as PendingPeoria,
        w = p.write;
      if (
        typeof p.round_id !== "string" ||
        !w ||
        w.user_id !== this.user ||
        typeof w.request_id !== "string" ||
        !Number.isSafeInteger(w.record_version) ||
        w.record_version < 0 ||
        !Number.isInteger(w.expected_runs) ||
        w.expected_runs < 0 ||
        w.expected_runs > 2 ||
        !/^[a-f0-9]{64}$/.test(w.confirmation_token) ||
        typeof w.exclude_incomplete !== "boolean" ||
        typeof w.confirm_recalculation !== "boolean" ||
        (p.rejected !== undefined && typeof p.rejected !== "string")
      )
        throw Error();
      return p;
    } catch {
      throw { code: "peoria_pending_corrupt" };
    }
  }
  private locked<T>(fn: () => Promise<T>) {
    const work = this.lane.then(() =>
      this.storage.exclusive ? this.storage.exclusive(fn) : fn(),
    );
    this.lane = work.catch(() => {});
    return work;
  }
  start(
    round: string,
    confirmed: Omit<PeoriaWrite, "user_id" | "request_id">,
    execute: Execute,
  ) {
    return this.locked(async () => {
      if (await this.read()) throw { code: "peoria_pending_exists" };
      const p: PendingPeoria = {
        round_id: round,
        write: { ...confirmed, user_id: this.user, request_id: this.uuid() },
      };
      await this.storage.setItem(this.key, JSON.stringify(p));
      return this.send(p, execute);
    });
  }
  retry(execute: Execute) {
    return this.locked(async () => {
      const p = await this.read();
      if (!p || p.rejected) throw { code: "peoria_pending_exists" };
      return this.send(p, execute);
    });
  }
  private async send(p: PendingPeoria, execute: Execute) {
    let ack: PeoriaAck;
    try {
      ack = await execute(p.round_id, p.write);
    } catch (e) {
      const error = e as { status?: number; code?: string };
      if (
        error.status &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 429 &&
        error.code
      ) {
        await this.storage.setItem(
          this.key,
          JSON.stringify({ ...p, rejected: error.code }),
        );
      }
      throw e;
    }
    if (ack.request_id !== p.write.request_id || typeof ack.run_id !== "string")
      throw { code: "network" };
    // If local acknowledgement fails, preserve the exact request for idempotent retry.
    await this.storage.removeItem(this.key);
    return ack;
  }
  clearRejected(requestId: string) {
    return this.locked(async () => {
      const p = await this.read();
      if (!p || p.write.request_id !== requestId || !p.rejected)
        throw { code: "peoria_pending_exists" };
      await this.storage.removeItem(this.key);
    });
  }
}
