import type { AdResult } from "./golf";
import type { Receipt, ReceiveAction } from "../../shared/records";
export type PendingReceipt = {
  user_id: string;
  action_id: string;
  delivery_id: string;
  outcome?: AdResult;
};
export type ReceiptAPI = {
  prepare: (p: PendingReceipt) => Promise<ReceiveAction>;
  settle: (p: PendingReceipt, outcome: AdResult) => Promise<ReceiveAction>;
  execute: (p: PendingReceipt) => Promise<{ receipt: Receipt }>;
};
type Storage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
  exclusive?: <T>(work: () => Promise<T>) => Promise<T>;
};
export class ReceiptFlow {
  private lane: Promise<unknown> = Promise.resolve();
  readonly key: string;
  constructor(
    readonly user: string,
    private storage: Storage,
    private uuid: () => string,
  ) {
    this.key = "ymg:pending-receipt:v1:" + user;
  }
  async read(): Promise<PendingReceipt | null> {
    const raw = await this.storage.getItem(this.key);
    if (!raw) return null;
    try {
      const p = JSON.parse(raw) as PendingReceipt;
      if (
        p.user_id !== this.user ||
        typeof p.action_id !== "string" ||
        typeof p.delivery_id !== "string" ||
        (p.outcome &&
          ![
            "completed",
            "unavailable",
            "load_failed",
            "show_failed",
            "load_timeout",
          ].includes(p.outcome))
      )
        throw Error();
      return p;
    } catch {
      throw { code: "receipt_pending_corrupt" };
    }
  }
  private async locked<T>(fn: () => Promise<T>) {
    const result = this.lane.then(() =>
      this.storage.exclusive ? this.storage.exclusive(fn) : fn(),
    );
    this.lane = result.catch(() => {});
    return result;
  }
  begin(delivery: string) {
    return this.locked(async () => {
      const old = await this.read();
      if (old) return old;
      const p: PendingReceipt = {
        user_id: this.user,
        delivery_id: delivery,
        action_id: this.uuid(),
      };
      await this.storage.setItem(this.key, JSON.stringify(p));
      return p;
    });
  }
  outcome(action: string, outcome: AdResult) {
    return this.locked(async () => {
      const p = await this.read();
      if (!p || p.action_id !== action) throw { code: "state_changed" };
      const next = { ...p, outcome };
      await this.storage.setItem(this.key, JSON.stringify(next));
      return next;
    });
  }
  clear(action: string) {
    return this.locked(async () => {
      const p = await this.read();
      if (p?.action_id === action) await this.storage.removeItem(this.key);
    });
  }
  async cancel(actionId: string, api: ReceiptAPI) {
    const p = await this.read();
    if (!p || p.action_id !== actionId) return;
    // Keep a completed ad durable even when the user leaves without receiving.
    // A failed acknowledgement must leave the pending proof available to retry.
    if (p.outcome) {
      const action = await api.prepare(p);
      if (!action.ad_settled && !action.completed_receipt)
        await api.settle(p, p.outcome);
    }
    await this.clear(actionId);
  }
  async finish(api: ReceiptAPI) {
    const p = await this.read();
    if (!p) throw { code: "receipt_pending_missing" };
    let action = await api.prepare(p);
    if (!action.completed_receipt && !action.ad_settled && p.outcome)
      action = await api.settle(p, p.outcome);
    if (!action.completed_receipt && !action.ad_settled)
      throw { code: "ad_required" };
    const result = await api.execute(p);
    // Failed local acknowledgement leaves the same action durable, including if
    // its receipt is subsequently deleted. Replay cannot recreate that receipt.
    await this.clear(p.action_id);
    return result.receipt;
  }
}
