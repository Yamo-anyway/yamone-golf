import { test } from "node:test";
import assert from "node:assert/strict";
import { calculatePeoria, hiddenCandidates } from "../src/peoria-engine";
const pars = Array(18).fill(4);
const player = (id: string, strokes: number) => ({
  slot_id: id,
  user_id: null,
  name: id,
  scores: Array(18).fill(strokes),
});
test("Peoria known examples, exact tenths, competition ties and input order independence", () => {
  const result = calculatePeoria(
    pars,
    [player("third", 6), player("a", 5), player("b", 5)],
    () => 0,
  );
  assert.deepEqual(
    result.results.map((r) => [r.slot_id, r.gross, r.handicap, r.net, r.rank]),
    [
      ["a", 90, 14.4, 75.6, 1],
      ["b", 90, 14.4, 75.6, 1],
      ["third", 108, 28.8, 79.2, 3],
    ],
  );
});
test("Peoria caps hole strokes only for handicap and clamps handicap to 0..36", () => {
  const p = player("p", 4);
  p.scores[0] = 100;
  const r = calculatePeoria(pars, [p], (n) => n - 1).results[0];
  assert.equal(r.gross, 168);
  assert.equal(r.handicap, 4.8);
  assert.equal(r.net, 163.2);
  assert.equal(
    calculatePeoria(pars, [player("low", 1)], () => 0).results[0].handicap,
    0,
  );
  assert.equal(
    calculatePeoria(pars, [player("high", 999)], () => 0).results[0].handicap,
    36,
  );
});
test("every candidate has six unique holes with PAR 24 per nine; normal courses prefer 1/4/1 PAR composition", () => {
  const normal = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
  const choices = hiddenCandidates(normal)!;
  for (const [half, rows] of choices.entries())
    for (const row of rows) {
      assert.equal(row.length, 6);
      assert.equal(new Set(row).size, 6);
      assert.ok(row.every((h) => h >= half * 9 && h < (half + 1) * 9));
      assert.equal(
        row.reduce((n, h) => n + normal[h], 0),
        24,
      );
      assert.deepEqual(
        [3, 4, 5].map((p) => row.filter((h) => normal[h] === p).length),
        [1, 4, 1],
      );
    }
  const first = calculatePeoria(normal, [player("p", 4)], () => 0),
    last = calculatePeoria(normal, [player("p", 4)], (n) => n - 1);
  assert.notDeepEqual(first.hidden_holes, last.hidden_holes);
  assert.equal(
    calculatePeoria(normal, [player("p", 4)]).hidden_holes.length,
    12,
  );
});
test("unsupported course profiles and null, zero or fractional scores cannot be calculated", () => {
  assert.equal(hiddenCandidates(Array(9).fill(4)), null);
  assert.equal(hiddenCandidates([...Array(17).fill(4), 3]), null);
  for (const bad of [null, 0, 4.5, 1000]) {
    const p = player("p", 4);
    p.scores[5] = bad;
    assert.throws(() => calculatePeoria(pars, [p]), /invalid_peoria_input/);
  }
});
