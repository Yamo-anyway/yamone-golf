import { test } from "node:test";
import assert from "node:assert/strict";
import { OfflineScores, offlineKey } from "../src/data/score-offline-core";
import { scoreAt, type ScoreSheet, type ScoreWrite } from "../shared/scores";
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const initial = (): ScoreSheet => ({
  round_id: "r",
  status: "active",
  hole_count: 18,
  course: {
    name: "Course",
    segments: [
      { name: "OUT", pars: Array(9).fill(4) },
      { name: "IN", pars: Array(9).fill(4) },
    ],
  },
  roster_version: 0,
  target_version: 0,
  slot_ids: ["a", "b"],
  players: [
    { slot_id: "a", name: "A", position: 0 },
    { slot_id: "b", name: "B", position: 1 },
  ],
  scores: [],
});
function fixture() {
  const disk = new Map<string, string>();
  let failure = false,
    network = false,
    lose = false,
    server = initial(),
    ids = 0;
  const received = new Map<string, string>(),
    requests: ScoreWrite[] = [];
  const storage = {
    getItem: async (k: string) => disk.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      if (failure) throw Error("full");
      disk.set(k, v);
    },
  };
  const transport = {
    get: async () => {
      if (network) throw { code: "network" };
      return clone(server);
    },
    save: async (_r: string, b: ScoreWrite) => {
      requests.push(clone(b));
      if (network) throw { code: "network" };
      if (received.has(b.mutation_id)) {
        assert.equal(received.get(b.mutation_id), JSON.stringify(b));
        return { sheet: clone(server) };
      }
      if (server.status === "ended") throw { code: "round_ended", status: 409 };
      if (
        b.target_version !== server.target_version ||
        b.roster_version !== server.roster_version
      )
        throw { code: "targets_changed", status: 409 };
      const conflicts = b.entries.flatMap((e) => {
        const s = scoreAt(server, e.slot_id, b.hole);
        return s.version !== e.version && s.strokes !== e.strokes
          ? [{ ...s, proposed: e.strokes }]
          : [];
      });
      if (conflicts.length)
        throw {
          code: "score_conflict",
          status: 409,
          details: { sheet: clone(server), conflicts },
        };
      for (const e of b.entries) {
        const s = scoreAt(server, e.slot_id, b.hole);
        if (s.strokes !== e.strokes) {
          server.scores = server.scores.filter(
            (x) => !(x.slot_id === e.slot_id && x.hole === b.hole),
          );
          server.scores.push({
            slot_id: e.slot_id,
            hole: b.hole,
            strokes: e.strokes,
            version: s.version + 1,
          });
        }
      }
      received.set(b.mutation_id, JSON.stringify(b));
      if (lose) {
        lose = false;
        throw { code: "network" };
      }
      return { sheet: clone(server) };
    },
  };
  const make = (user = "u") =>
    new OfflineScores(user, storage, transport, () => String(++ids));
  return {
    disk,
    storage,
    transport,
    requests,
    received,
    make,
    get server() {
      return server;
    },
    set server(s: ScoreSheet) {
      server = s;
    },
    set failure(v: boolean) {
      failure = v;
    },
    set network(v: boolean) {
      network = v;
    },
    set lose(v: boolean) {
      lose = v;
    },
  };
}
const r = (s: OfflineScores) => s.snapshot().data.rounds.r;
test("every acknowledged edit survives restart across holes, preserves null/PAR and selected order", async () => {
  const f = fixture(),
    s = f.make();
  await s.refresh("r");
  await s.change("r", 1, "a", 1);
  await s.visit("r", 10);
  await s.change("r", 10, "b", 2);
  const restarted = f.make();
  await restarted.open();
  assert.equal(r(restarted).lastHole, 10);
  assert.equal(r(restarted).drafts[1].rows[0].strokes, 5);
  assert.equal(r(restarted).drafts[10].rows[1].strokes, 6);
  assert.deepEqual(r(restarted).sheet.scores, []);
  assert.equal(f.requests.length, 0);
});
test("rapid changes and a concurrent refresh are serialized without dropping taps or replacing drafts", async () => {
  const f = fixture(),
    s = f.make();
  await s.refresh("r");
  await Promise.all(Array.from({ length: 8 }, () => s.change("r", 1, "a", 1)));
  await s.refresh("r");
  assert.equal(r(s).drafts[1].rows[0].strokes, 12);
});
test("local write failure never sends a request, publishes an accepted edit, or discards an old draft", async () => {
  const f = fixture(),
    s = f.make();
  await s.refresh("r");
  await s.change("r", 1, "a", 1);
  const old = f.disk.get(offlineKey("u"));
  f.failure = true;
  await assert.rejects(s.change("r", 1, "a", 1));
  assert.equal(r(s).drafts[1].rows[0].strokes, 5);
  await assert.rejects(s.enqueue("r", 1));
  assert.equal(f.requests.length, 0);
  assert.equal(f.disk.get(offlineKey("u")), old);
  await assert.rejects(s.discard("r", 1));
  assert.ok(r(s).drafts[1]);
  assert.equal(s.snapshot().error, "offline_storage");
});
test("queue is durable before sending, persists across offline restart, and never auto-sends drafts", async () => {
  const f = fixture(),
    s = f.make();
  await s.refresh("r");
  await s.change("r", 1, "a", 1);
  await s.change("r", 2, "b", 1);
  await s.enqueue("r", 1);
  f.network = true;
  await s.sync();
  const id = r(s).queue[1].write.mutation_id,
    restart = f.make();
  await restart.open();
  assert.equal(r(restart).queue[1].write.mutation_id, id);
  assert.equal(r(restart).queue[1].write.user_id, "u");
  f.network = false;
  await restart.sync();
  assert.deepEqual(Object.keys(r(restart).queue), []);
  assert.ok(r(restart).drafts[2]);
  assert.ok(f.requests.every((b) => b.mutation_id === id));
  assert.equal(f.received.size, 1);
});
test("lost successful response is replayed after restart without overwriting a newer writer", async () => {
  const f = fixture(),
    s = f.make();
  await s.refresh("r");
  await s.change("r", 1, "a", 1);
  await s.enqueue("r", 1);
  f.lose = true;
  await s.sync();
  const id = r(s).queue[1].write.mutation_id;
  f.server.scores[0] = { ...f.server.scores[0], strokes: 9, version: 2 };
  const restart = f.make();
  await restart.open();
  await restart.sync();
  assert.equal(scoreAt(r(restart).sheet, "a", 1).strokes, 9);
  assert.equal(f.requests[1].mutation_id, id);
  assert.equal(f.received.size, 1);
});
test("failure to persist server acknowledgement retains the immutable request for safe replay", async () => {
  const f = fixture();
  const transport = {
    ...f.transport,
    save: async (round: string, b: ScoreWrite) => {
      const result = await f.transport.save(round, b);
      f.failure = true;
      return result;
    },
  };
  const s = new OfflineScores("u", f.storage, transport, () => "one");
  await s.refresh("r");
  await s.enqueue("r", 1);
  await s.sync();
  assert.ok(r(s).queue[1]);
  f.failure = false;
  const restart = f.make();
  await restart.open();
  await restart.sync();
  assert.ok(!r(restart).queue[1]);
  assert.equal(f.received.size, 1);
});
test("a conflicting hole is held while other holes sync; conflict survives restart and can recur on confirmation", async () => {
  const f = fixture(),
    s = f.make();
  await s.refresh("r");
  await s.change("r", 1, "a", 1);
  await s.enqueue("r", 1);
  await s.enqueue("r", 2);
  f.server.scores = [{ slot_id: "a", hole: 1, strokes: 6, version: 1 }];
  await s.sync();
  assert.equal(r(s).queue[1].state, "conflict");
  assert.ok(!r(s).queue[2]);
  const restart = f.make();
  await restart.open();
  await restart.confirm("r", 1);
  f.server.scores[0] = { slot_id: "a", hole: 1, strokes: 7, version: 2 };
  await restart.sync();
  assert.equal(r(restart).queue[1].conflicts![0].strokes, 7);
  await restart.confirm("r", 1);
  await restart.sync();
  assert.ok(!r(restart).queue[1]);
  assert.equal(scoreAt(f.server, "a", 1).strokes, 5);
});
test("rejecting conflicts updates only conflicting rows and keeps other local edits durable", async () => {
  const f = fixture(),
    s = f.make();
  await s.refresh("r");
  await s.change("r", 1, "a", 1);
  await s.change("r", 1, "b", 2);
  await s.enqueue("r", 1);
  f.server.scores = [{ slot_id: "a", hole: 1, strokes: 8, version: 1 }];
  await s.sync();
  await s.reject("r", 1);
  const restart = f.make();
  await restart.open();
  assert.equal(r(restart).drafts[1].rows[0].strokes, 8);
  assert.equal(r(restart).drafts[1].rows[0].edited, false);
  assert.equal(r(restart).drafts[1].rows[1].strokes, 6);
  assert.equal(r(restart).drafts[1].rows[1].edited, true);
});
test("pending hole cannot be edited or deleted ambiguously; other holes remain editable", async () => {
  const f = fixture(),
    s = f.make();
  await s.refresh("r");
  await s.enqueue("r", 1);
  const id = r(s).queue[1].write.mutation_id;
  await assert.rejects(s.change("r", 1, "a", 1));
  await s.enqueue("r", 1, true);
  assert.equal(r(s).queue[1].write.mutation_id, id);
  assert.equal(r(s).queue[1].write.entries[0].strokes, 4);
  await s.change("r", 2, "a", 1);
  assert.ok(r(s).drafts[2]);
});
test("ended round queues are held unchanged and are never retried automatically", async () => {
  const f = fixture(),
    s = f.make();
  await s.refresh("r");
  await s.enqueue("r", 1);
  const expected = clone(r(s).queue[1].write);
  f.server.status = "ended";
  await s.sync();
  assert.equal(r(s).queue[1].state, "blocked");
  assert.equal(r(s).queue[1].error, "round_ended");
  await s.sync();
  assert.equal(f.requests.length, 1);
  const restart = f.make();
  await restart.open();
  assert.deepEqual(r(restart).queue[1].write, expected);
  await assert.rejects(restart.reprepare("r", 1));
});
test("target list changes hold the original and explicit reprepare keeps old score versions for another conflict check", async () => {
  const f = fixture(),
    s = f.make();
  await s.refresh("r");
  await s.change("r", 1, "a", 1);
  await s.enqueue("r", 1);
  f.server.target_version = 1;
  f.server.slot_ids = ["a"];
  f.server.scores = [{ slot_id: "a", hole: 1, strokes: 7, version: 1 }];
  await s.sync();
  assert.equal(r(s).queue[1].state, "blocked");
  await s.refresh("r");
  await s.reprepare("r", 1);
  assert.deepEqual(
    r(s).drafts[1].rows.map((x) => x.slot_id),
    ["a"],
  );
  await s.enqueue("r", 1);
  await s.sync();
  assert.equal(r(s).queue[1].state, "conflict");
});
test("user namespaces are isolated and corrupt local data is never replaced", async () => {
  const f = fixture(),
    s = f.make();
  await s.refresh("r");
  await s.enqueue("r", 1);
  const other = f.make("other");
  await other.open();
  assert.deepEqual(other.snapshot().data.rounds, {});
  f.disk.set(offlineKey("bad"), "{broken");
  const broken = f.make("bad");
  await assert.rejects(broken.open());
  await assert.rejects(broken.refresh("r"));
  assert.equal(f.disk.get(offlineKey("bad")), "{broken");
  f.disk.set(offlineKey("wrong"), JSON.stringify(s.snapshot().data));
  await assert.rejects(f.make("wrong").open());
});
test("overlapping sync calls send one request and server refresh cannot erase pending local state", async () => {
  const f = fixture(),
    s = f.make();
  await s.refresh("r");
  await s.enqueue("r", 1);
  await s.change("r", 2, "a", 1);
  await Promise.all([s.sync(), s.sync(), s.refresh("r")]);
  assert.equal(f.requests.length, 1);
  assert.ok(r(s).drafts[2]);
  assert.equal(scoreAt(r(s).sheet, "a", 1).strokes, 4);
});
test("disabled old user store does not send its queue", async () => {
  const f = fixture(),
    s = f.make();
  await s.refresh("r");
  await s.enqueue("r", 1);
  s.enabled = false;
  await s.sync();
  assert.equal(f.requests.length, 0);
  assert.ok(r(s).queue[1]);
});
test("repreparing a blocked deletion retains deletion intent and does not upload old numeric values", async () => {
  const f = fixture(),
    s = f.make();
  f.server.scores = [{ slot_id: "a", hole: 1, strokes: 5, version: 1 }];
  await s.refresh("r");
  await s.enqueue("r", 1, true);
  f.server.target_version = 1;
  await s.sync();
  await s.refresh("r");
  await s.reprepare("r", 1);
  assert.equal(r(s).drafts[1].deleting, true);
  await s.enqueue("r", 1);
  assert.ok(r(s).queue[1].write.entries.every((e) => e.strokes === null));
  await s.sync();
  assert.equal(scoreAt(f.server, "a", 1).strokes, null);
});

test("ending checks drafts and pending scores across every hole, including conflicts", async () => {
  const f = fixture(),
    s = f.make();
  await s.refresh("r");
  await s.change("r", 1, "a", 1);
  await s.change("r", 18, "a", 1);
  await assert.rejects(
    s.prepareEnd("r", 2),
    (e: any) => e.code === "end_local_pending",
  );
  await s.discard("r", 1);
  await assert.rejects(
    s.prepareEnd("r", 2),
    (e: any) => e.code === "end_local_pending",
  );
  await s.enqueue("r", 18);
  await assert.rejects(
    s.prepareEnd("r", 2),
    (e: any) => e.code === "end_local_pending",
  );
  f.server.scores.push({ slot_id: "a", hole: 18, strokes: 6, version: 1 });
  await s.sync();
  assert.equal(r(s).queue[18].state, "conflict");
  await assert.rejects(
    s.prepareEnd("r", 2),
    (e: any) => e.code === "end_local_pending",
  );
  await s.confirm("r", 18);
  await s.sync();
  assert.equal((await s.prepareEnd("r", 2)).record_version, 2);
});
test("durable ending request survives response loss and restart, locks input and replays its original version", async () => {
  const { sendEnd } = await import("../src/data/end-round");
  const f = fixture(),
    s = f.make();
  await s.refresh("r");
  let sent: any;
  await assert.rejects(
    sendEnd(s, "r", 7, async (b) => {
      sent = b;
      throw { code: "network" };
    }),
  );
  assert.deepEqual(r(s).endRequest, sent);
  const next = f.make();
  await next.open();
  await assert.rejects(
    next.change("r", 1, "a", 1),
    (e: any) => e.code === "end_pending",
  );
  await assert.rejects(
    next.enqueue("r", 1),
    (e: any) => e.code === "end_pending",
  );
  await sendEnd(next, "r", 99, async (b) => {
    assert.deepEqual(b, sent);
    return { status: "ended" } as any;
  });
  assert.equal(r(next).sheet.status, "ended");
  assert.equal(r(next).endRequest, undefined);
  await next.refresh("r"); // stale active response from an earlier read
  assert.equal(r(next).sheet.status, "ended");
});
test("ending requires durable checkpoint; failed acknowledgement keeps request for safe retry", async () => {
  const { sendEnd } = await import("../src/data/end-round");
  const f = fixture(),
    s = f.make();
  await s.refresh("r");
  f.failure = true;
  let calls = 0;
  await assert.rejects(
    sendEnd(s, "r", 1, async () => {
      calls++;
      return {} as any;
    }),
  );
  assert.equal(calls, 0);
  f.failure = false;
  await assert.rejects(
    sendEnd(s, "r", 1, async () => {
      f.failure = true;
      return { status: "ended" } as any;
    }),
  );
  const original = r(s).endRequest!;
  assert.ok(original);
  f.failure = false;
  await sendEnd(s, "r", 2, async (b) => {
    assert.deepEqual(b, original);
    return { status: "ended" } as any;
  });
  assert.equal(r(s).endRequest, undefined);
});
test("known server changes require new confirmation and allow editing; ambiguous errors keep ending locked", async () => {
  const { sendEnd } = await import("../src/data/end-round");
  const f = fixture(),
    s = f.make();
  await s.refresh("r");
  await assert.rejects(
    sendEnd(s, "r", 1, async () => {
      throw { code: "end_changed", status: 409 };
    }),
  );
  assert.equal(r(s).endRequest, undefined);
  await s.change("r", 1, "a", 1);
  await s.discard("r", 1);
  await assert.rejects(
    sendEnd(s, "r", 2, async () => {
      throw { code: "server_error", status: 500 };
    }),
  );
  assert.ok(r(s).endRequest);
});
test("ending and draft discard re-read storage so a second editor cannot silently lose new drafts", async () => {
  const f = fixture(),
    a = f.make(),
    b = f.make();
  await a.refresh("r");
  await b.open();
  await a.change("r", 1, "a", 1);
  const expected = JSON.stringify(r(a).drafts);
  await b.change("r", 2, "b", 1);
  await assert.rejects(
    a.discardDrafts("r", expected),
    (e: any) => e.code === "end_local_changed",
  );
  await assert.rejects(
    a.prepareEnd("r", 1),
    (e: any) => e.code === "end_local_pending",
  );
  await a.reloadLocal();
  await a.discardDrafts("r", JSON.stringify(r(a).drafts));
  const pending = await a.prepareEnd("r", 1);
  await assert.rejects(
    b.change("r", 3, "a", 1),
    (e: any) => e.code === "end_pending",
  );
  assert.deepEqual(await b.prepareEnd("r", 5), pending);
});
