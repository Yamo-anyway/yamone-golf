import { test } from "node:test";
import assert from "node:assert/strict";
import { PeoriaFlow } from "../src/data/peoria-flow-core";
import type { PeoriaWrite } from "../shared/peoria";
const confirmed = {
  record_version: 1,
  expected_runs: 0,
  confirmation_token: "a".repeat(64),
  exclude_incomplete: true,
  confirm_recalculation: false,
};
function fixture() {
  const disk = new Map<string, string>();
  let ids = 0,
    failWrite = false,
    failClear = false,
    lose = false,
    code = "",
    calls = 0;
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
  const committed = new Map<string, string>();
  const payloads: PeoriaWrite[] = [];
  const execute = async (_round: string, w: PeoriaWrite) => {
    calls++;
    payloads.push(structuredClone(w));
    if (code) throw { code, status: 409 };
    const replayed = committed.has(w.request_id);
    if (!replayed) committed.set(w.request_id, "run-" + w.request_id);
    if (lose) {
      lose = false;
      throw { code: "network", status: 0 };
    }
    return {
      request_id: w.request_id,
      run_id: committed.get(w.request_id)!,
      replayed,
    };
  };
  return {
    disk,
    storage,
    execute,
    payloads,
    committed,
    make: () => new PeoriaFlow("user", storage, () => String(++ids)),
    get calls() {
      return calls;
    },
    set failWrite(v: boolean) {
      failWrite = v;
    },
    set failClear(v: boolean) {
      failClear = v;
    },
    set lose(v: boolean) {
      lose = v;
    },
    set code(v: string) {
      code = v;
    },
  };
}
test("Peoria persists before execution, survives response loss and replays the original request after restart", async () => {
  const f = fixture();
  f.lose = true;
  const flow = f.make();
  await assert.rejects(flow.start("round", confirmed, f.execute));
  const original = await flow.read();
  assert.ok(original);
  assert.equal(f.committed.size, 1);
  const next = f.make();
  await assert.rejects(next.start("other", confirmed, f.execute));
  const ack = await next.retry(f.execute);
  assert.equal(ack.replayed, true);
  assert.equal(f.committed.size, 1);
  assert.deepEqual(f.payloads[1], f.payloads[0]);
  assert.equal(await next.read(), null);
});
test("storage failure prevents Peoria dispatch; failed local acknowledgement preserves its committed request", async () => {
  const f = fixture(),
    flow = f.make();
  f.failWrite = true;
  await assert.rejects(flow.start("round", confirmed, f.execute));
  assert.equal(f.calls, 0);
  f.failWrite = false;
  f.failClear = true;
  await assert.rejects(flow.start("round", confirmed, f.execute));
  assert.ok(await flow.read());
  f.failClear = false;
  await flow.retry(f.execute);
  assert.equal(f.committed.size, 1);
});
test("unknown requests cannot be discarded; definitive rejection requires explicit fresh confirmation", async () => {
  const f = fixture(),
    flow = f.make();
  f.code = "peoria_changed";
  await assert.rejects(flow.start("round", confirmed, f.execute));
  const p = (await flow.read())!;
  assert.equal(p.rejected, "peoria_changed");
  await assert.rejects(flow.retry(f.execute));
  await flow.clearRejected(p.write.request_id);
  assert.equal(await flow.read(), null);
  f.code = "";
  f.lose = true;
  await assert.rejects(flow.start("round", confirmed, f.execute));
  await assert.rejects(
    flow.clearRejected((await flow.read())!.write.request_id),
  );
  assert.ok(await flow.read());
});
test("parallel Peoria taps cannot create two requests; malformed or foreign saved requests are preserved", async () => {
  const f = fixture(),
    flow = f.make();
  f.lose = true;
  await Promise.allSettled([
    flow.start("round", confirmed, f.execute),
    flow.start("round", confirmed, f.execute),
  ]);
  assert.equal(f.calls, 1);
  const key = flow.key;
  for (const text of [
    '{"round_id":"r"}',
    JSON.stringify({
      round_id: "r",
      write: { ...confirmed, user_id: "other", request_id: "id" },
    }),
  ]) {
    f.disk.set(key, text);
    await assert.rejects(flow.read());
    assert.equal(f.disk.get(key), text);
  }
});
