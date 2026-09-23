import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ReceiptFlow,
  type ReceiptAPI,
  type PendingReceipt,
} from "../src/data/receipt-flow-core";
import type { ReceiveAction, Receipt } from "../shared/records";
function fixture() {
  const disk = new Map<string, string>(),
    requests: PendingReceipt[] = [];
  let failWrite = false,
    failClear = false,
    lose = false,
    settled = false,
    receipt: Receipt | null = null,
    ids = 0;
  const storage = {
    getItem: async (k: string) => disk.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      if (failWrite) throw Error("quota");
      disk.set(k, v);
    },
    removeItem: async (k: string) => {
      if (failClear) throw Error("quota");
      disk.delete(k);
    },
  };
  const api: ReceiptAPI = {
    prepare: async (p) =>
      ({
        action_id: p.action_id,
        ad_settled: settled,
        completed_receipt: receipt,
        available: true,
      }) as ReceiveAction,
    settle: async (p) => {
      settled = true;
      return api.prepare(p);
    },
    execute: async (p) => {
      requests.push({ ...p });
      if (!settled) throw { code: "ad_required" };
      receipt ??= {
        receipt_id: "r",
        round_id: "round",
        user_id: p.user_id,
        player_slot_id: "slot",
        delivery_id: p.delivery_id,
        status: "received",
        received_at: 1,
        deleted_at: null,
      };
      if (lose) {
        lose = false;
        throw { code: "network" };
      }
      return { receipt };
    },
  };
  return {
    disk,
    requests,
    api,
    make: () => new ReceiptFlow("user", storage, () => String(++ids)),
    set failWrite(v: boolean) {
      failWrite = v;
    },
    set failClear(v: boolean) {
      failClear = v;
    },
    set lose(v: boolean) {
      lose = v;
    },
    get receipt() {
      return receipt;
    },
    get settled() {
      return settled;
    },
  };
}
test("interrupted ad survives restart as unfinished and does not receive a record", async () => {
  const f = fixture(),
    flow = f.make(),
    p = await flow.begin("delivery");
  const next = f.make();
  assert.deepEqual(await next.read(), p);
  await assert.rejects(
    next.finish(f.api),
    (e: any) => e.code === "ad_required",
  );
  assert.equal(f.requests.length, 0);
  assert.equal(f.settled, false);
  assert.equal((await next.read())!.action_id, p.action_id);
});
test("ad outcome is durable before settlement; replay after lost receive response cannot duplicate or restore a deleted receipt", async () => {
  const f = fixture(),
    flow = f.make(),
    p = await flow.begin("delivery");
  await flow.outcome(p.action_id, "load_failed");
  f.lose = true;
  await assert.rejects(flow.finish(f.api));
  assert.equal(f.settled, true);
  assert.equal(f.receipt!.status, "received");
  f.receipt!.status = "deleted";
  f.receipt!.deleted_at = 2;
  const next = f.make(),
    result = await next.finish(f.api);
  assert.equal(result.status, "deleted");
  assert.equal(f.requests.length, 2);
  assert.deepEqual(f.requests[0], f.requests[1]);
  assert.equal(await next.read(), null);
});
test("storage failures prevent ad settlement and preserve a completed receive request until acknowledgement succeeds", async () => {
  const f = fixture(),
    flow = f.make();
  f.failWrite = true;
  await assert.rejects(flow.begin("delivery"));
  assert.equal(f.requests.length, 0);
  f.failWrite = false;
  const p = await flow.begin("delivery");
  f.failWrite = true;
  await assert.rejects(flow.outcome(p.action_id, "completed"));
  assert.equal((await flow.read())!.outcome, undefined);
  f.failWrite = false;
  await flow.outcome(p.action_id, "completed");
  f.failClear = true;
  await assert.rejects(flow.finish(f.api));
  assert.equal(f.receipt!.status, "received");
  assert.ok(await flow.read());
  f.failClear = false;
  await f.make().finish(f.api);
  assert.equal(await flow.read(), null);
});
test("new selection cannot replace a pending action, concurrent local begins serialize, stale completion cannot clear a newer action", async () => {
  const f = fixture(),
    flow = f.make();
  const [a, b] = await Promise.all([flow.begin("first"), flow.begin("second")]);
  assert.deepEqual(a, b);
  await flow.clear(a.action_id);
  const c = await flow.begin("third");
  await flow.clear(a.action_id);
  assert.deepEqual(await flow.read(), c);
  await assert.rejects(
    flow.outcome(a.action_id, "completed"),
    (e: any) => e.code === "state_changed",
  );
});
test("malformed or foreign-user pending data is preserved instead of being reused", async () => {
  const f = fixture(),
    flow = f.make();
  for (const raw of [
    "broken",
    JSON.stringify({ user_id: "other", action_id: "a", delivery_id: "d" }),
  ]) {
    f.disk.set(flow.key, raw);
    await assert.rejects(
      flow.begin("next"),
      (e: any) => e.code === "receipt_pending_corrupt",
    );
    assert.equal(f.disk.get(flow.key), raw);
  }
});
test("leaving without receiving settles a saved ad outcome first and preserves it on a network failure", async () => {
  const f = fixture(),
    flow = f.make(),
    p = await flow.begin("delivery");
  await flow.outcome(p.action_id, "unavailable");
  const offline: ReceiptAPI = {
    ...f.api,
    settle: async () => {
      throw { code: "network" };
    },
  };
  await assert.rejects(flow.cancel(p.action_id, offline));
  assert.equal((await flow.read())?.outcome, "unavailable");
  assert.equal(f.settled, false);
  assert.equal(f.requests.length, 0);
  await flow.cancel(p.action_id, f.api);
  assert.equal(f.settled, true);
  assert.equal(f.requests.length, 0);
  assert.equal(await flow.read(), null);
  const next = await flow.begin("next");
  await flow.cancel(p.action_id, f.api);
  assert.deepEqual(await flow.read(), next);
  await flow.cancel(next.action_id, offline);
  assert.equal(await flow.read(), null);
});
