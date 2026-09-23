import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialHole,
  ranking,
  symbolFor,
  type ScoreSheet,
} from "../shared/scores";
const base: ScoreSheet = {
  round_id: "r",
  status: "active",
  hole_count: 18,
  course: {
    name: "c",
    segments: [
      { name: "a", pars: Array(9).fill(4) },
      { name: "b", pars: Array(9).fill(4) },
    ],
  },
  roster_version: 0,
  target_version: 0,
  slot_ids: ["c", "b", "a"],
  players: ["a", "b", "c", "d"].map((slot_id, position) => ({
    slot_id,
    name: slot_id,
    position,
  })),
  scores: [],
};
test("first hole, last visited and first missing selection do not depend on front/back defaults", () => {
  assert.equal(initialHole(base, null), 1);
  assert.equal(initialHole(base, 7), 7);
  assert.equal(initialHole(base, 19), 1);
  const s = {
    ...base,
    scores: base.slot_ids.map((slot_id) => ({
      slot_id,
      hole: 1,
      strokes: 4,
      version: 1,
    })),
  };
  assert.equal(initialHole(s, null), 2);
});
test("cumulative ranking includes partial rounds, competition ties, missing excluded and target order independent", () => {
  const s = {
    ...base,
    scores: [
      { slot_id: "a", hole: 1, strokes: 4, version: 1 },
      { slot_id: "b", hole: 1, strokes: 4, version: 1 },
      { slot_id: "c", hole: 1, strokes: 5, version: 1 },
      { slot_id: "d", hole: 1, strokes: null, version: 2 },
    ],
  };
  assert.deepEqual(
    ranking(s).map((p) => [p.slot_id, p.total, p.rank]),
    [
      ["a", 4, 1],
      ["b", 4, 1],
      ["c", 5, 3],
      ["d", null, null],
    ],
  );
  assert.deepEqual(s.slot_ids, ["c", "b", "a"]);
  assert.ok(ranking(s, 2).every((p) => p.rank === null));
});
test("one circle for birdie or better, one/two boxes, par unmarked and null unentered", () => {
  assert.deepEqual(
    [null, 1, 2, 3, 4, 5, 6, 9].map((s) => symbolFor(s, 4)),
    ["empty", "birdie", "birdie", "birdie", "par", "bogey", "double", "double"],
  );
});
