import { test } from "node:test";
import assert from "node:assert/strict";
import { Corrections, type CorrectionAPI } from "../src/data/corrections-core";
import {
  editAccess,
  type PersonalScoreView,
  type PersonalScoreWrite,
} from "../shared/personal-records";
const makeView = (): PersonalScoreView => ({
  receipt_id: "r",
  round_id: "round",
  user_id: "u",
  player_slot_id: "s",
  slot_version: 1,
  player_name: "me",
  hole_count: 18,
  course: {
    name: "course",
    segments: [
      { name: "OUT", pars: Array(9).fill(4) },
      { name: "IN", pars: Array(9).fill(4) },
    ],
  },
  scores: [{ slot_id: "s", hole: 1, strokes: 4, version: 1 }],
  edit: editAccess(0, true, true, 1),
});
function fixture() {
  const disk = new Map<string, string>(),
    requests: PersonalScoreWrite[] = [],
    done = new Map<string, PersonalScoreWrite>();
  let fail = false,
    failAck = false,
    lose = false,
    seq = 0,
    v = makeView();
  const storage = {
    getItem: async (k: string) => disk.get(k) ?? null,
    setItem: async (k: string, s: string) => {
      if (fail || (failAck && !JSON.parse(s).records.r.pending))
        throw Error("disk");
      disk.set(k, s);
    },
  };
  const api: CorrectionAPI = {
    load: async () => structuredClone(v),
    save: async (_, w) => {
      requests.push(structuredClone(w));
      const old = done.get(w.mutation_id);
      if (old) {
        assert.deepEqual(old, w);
        return { mutation_id: w.mutation_id, replayed: true };
      }
      if (!v.edit.allowed) throw { code: v.edit.reason, status: 409 };
      const current = v.scores.find((s) => s.hole === w.hole) ?? {
        slot_id: "s",
        hole: w.hole,
        strokes: null,
        version: 0,
      };
      if (w.version !== current.version && w.strokes !== current.strokes)
        throw {
          code: "score_conflict",
          status: 409,
          details: { current, view: structuredClone(v) },
        };
      v.scores = v.scores.filter((s) => s.hole !== w.hole);
      v.scores.push({
        ...current,
        strokes: w.strokes,
        version: current.version + (current.strokes === w.strokes ? 0 : 1),
      });
      done.set(w.mutation_id, structuredClone(w));
      if (lose) {
        lose = false;
        throw { code: "network" };
      }
      return { mutation_id: w.mutation_id, replayed: false };
    },
  };
  return {
    disk,
    api,
    requests,
    make: () => new Corrections("u", storage, () => String(++seq)),
    get view() {
      return v;
    },
    set fail(x: boolean) {
      fail = x;
    },
    set failAck(x: boolean) {
      failAck = x;
    },
    set lose(x: boolean) {
      lose = x;
    },
  };
}
test("personal drafts survive restart and refresh without becoming saved, default PAR and null remain distinct", async () => {
  const f = fixture(),
    s = f.make();
  await s.refresh("r", f.api);
  assert.equal((await s.read("r")).hole, 2);
  await s.change("r", 1, 5);
  await s.visit("r", 9);
  await s.change("r", 9, 3);
  const next = f.make();
  await next.refresh("r", f.api);
  assert.equal((await next.read("r")).drafts[1].strokes, 5);
  assert.equal((await next.read("r")).hole, 9);
  assert.equal(f.requests.length, 0);
  await next.change("r", 1, null);
  assert.equal((await next.read("r")).drafts[1].strokes, null);
  await next.send("r", 1, f.api);
  assert.equal(f.view.scores.find((s) => s.hole === 1)!.strokes, null);
  assert.equal((await next.read("r")).drafts[9].strokes, 3);
  assert.equal((await next.summaries()).length, 1);
});
test("write checkpoint, lost response, deadline expiry and local acknowledgement failure retain the same request", async () => {
  const f = fixture(),
    s = f.make();
  await s.refresh("r", f.api);
  await s.change("r", 1, 5);
  f.fail = true;
  await assert.rejects(s.send("r", 1, f.api));
  assert.equal(f.requests.length, 0);
  f.fail = false;
  f.lose = true;
  await assert.rejects(s.send("r", 1, f.api));
  const pending = (await s.read("r")).pending!;
  assert.equal(pending.state, "unknown");
  await assert.rejects(s.discard("r", 1));
  await assert.rejects(s.change("r", 1, 8));
  f.view.edit = editAccess(0, true, true, 86400000);
  f.failAck = true;
  await assert.rejects(f.make().send("r", 1, f.api, "retry"));
  assert.deepEqual((await s.read("r")).pending!.write, pending.write);
  f.failAck = false;
  await f.make().send("r", 1, f.api, "retry");
  assert.equal((await s.read("r")).pending, null);
  assert.deepEqual(f.requests[0], f.requests[1]);
  assert.deepEqual(f.requests[0], f.requests[2]);
});
test("conflict confirm uses a new request and latest version, repeat conflicts require another confirmation; reject preserves other drafts", async () => {
  const f = fixture(),
    s = f.make();
  await s.refresh("r", f.api);
  await s.change("r", 1, 5);
  await s.change("r", 2, 7);
  f.view.scores[0] = { slot_id: "s", hole: 1, strokes: 6, version: 2 };
  await assert.rejects(s.send("r", 1, f.api));
  const p = (await s.read("r")).pending!;
  assert.equal(p.state, "conflict");
  f.view.scores[0] = { slot_id: "s", hole: 1, strokes: 8, version: 3 };
  await assert.rejects(s.send("r", 1, f.api, "confirm"));
  assert.notEqual(f.requests[0].mutation_id, f.requests[1].mutation_id);
  assert.equal(f.requests[1].version, 2);
  await s.reject("r");
  const r = await s.read("r");
  assert.equal(r.view!.scores[0].strokes, 8);
  assert.equal(r.drafts[1], undefined);
  assert.equal(r.drafts[2].strokes, 7);
});
test("known deadline rejection holds the value until explicit discard, cannot silently upload offline drafts", async () => {
  const f = fixture(),
    s = f.make();
  await s.refresh("r", f.api);
  await s.change("r", 1, 5);
  f.view.edit = editAccess(0, true, true, 86400000);
  await assert.rejects(s.send("r", 1, f.api));
  assert.equal((await s.read("r")).pending!.state, "blocked");
  await s.refresh("r", f.api);
  assert.equal((await s.read("r")).drafts[1].strokes, 5);
  assert.equal(f.requests.length, 1);
  await s.discard("r", 1);
  assert.equal((await s.read("r")).pending, null);
  assert.equal((await s.summaries()).length, 0);
});
test("two concurrent editors serialize disk writes and corrupt or foreign data is preserved", async () => {
  const f = fixture(),
    s = f.make();
  await s.refresh("r", f.api);
  await Promise.all([s.change("r", 1, 5), s.change("r", 2, 6)]);
  assert.equal(Object.keys((await s.read("r")).drafts).length, 2);
  for (const raw of [
    "broken",
    JSON.stringify({ version: 1, user_id: "other", records: {} }),
  ]) {
    f.disk.set(s.key, raw);
    await assert.rejects(s.refresh("r", f.api));
    assert.equal(f.disk.get(s.key), raw);
  }
});
test("edit access has a strict 24-hour boundary and never extends on receipt time", () => {
  assert.equal(editAccess(100, true, true, 100 + 86400000 - 1).allowed, true);
  assert.equal(editAccess(100, true, true, 100 + 86400000).allowed, false);
  assert.equal(editAccess(100, false, true, 101).reason, "record_deleted");
  assert.equal(editAccess(100, true, false, 101).reason, "record_unlinked");
});
