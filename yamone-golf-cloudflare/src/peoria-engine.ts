import type { PeoriaPlayerSnapshot, PeoriaResult } from "../../shared/peoria";
// Fixed, documented competition profile; not a personal handicap index.
export const PEORIA_ALGORITHM = "new-peoria-par72-doublepar-hcp0to36-v1";
export function hiddenCandidates(pars: number[]) {
  if (
    pars.length !== 18 ||
    pars.some((p) => !Number.isInteger(p) || p < 3 || p > 7) ||
    pars.reduce((a, b) => a + b, 0) !== 72
  )
    return null;
  const halves = [0, 9].map((offset) => {
    const choices: number[][] = [];
    // Select six of nine. All valid combinations are equally likely.
    for (let a = 0; a < 7; a++)
      for (let b = a + 1; b < 8; b++)
        for (let c = b + 1; c < 9; c++) {
          const holes = Array.from({ length: 9 }, (_, i) => i)
            .filter((i) => i !== a && i !== b && i !== c)
            .map((i) => i + offset);
          if (holes.reduce((n, i) => n + pars[i], 0) === 24)
            choices.push(holes);
        }
    const usual = choices.filter(
      (h) =>
        h.filter((i) => pars[i] === 3).length === 1 &&
        h.filter((i) => pars[i] === 4).length === 4 &&
        h.filter((i) => pars[i] === 5).length === 1,
    );
    return usual.length ? usual : choices;
  });
  return halves.every((h) => h.length > 0) ? halves : null;
}
function randomIndex(n: number) {
  const limit = Math.floor(0x100000000 / n) * n;
  const bytes = new Uint32Array(1);
  do {
    crypto.getRandomValues(bytes);
  } while (bytes[0] >= limit);
  return bytes[0] % n;
}
export function calculatePeoria(
  pars: number[],
  players: PeoriaPlayerSnapshot[],
  choose = randomIndex,
) {
  const candidates = hiddenCandidates(pars);
  if (
    !candidates ||
    !players.length ||
    players.some(
      (p) =>
        p.scores.length !== 18 ||
        p.scores.some(
          (s) => s === null || !Number.isInteger(s) || s < 1 || s > 999,
        ),
    )
  )
    throw Error("invalid_peoria_input");
  const hidden = candidates.flatMap((c) => c[choose(c.length)]);
  if (hidden.length !== 12 || new Set(hidden).size !== 12)
    throw Error("invalid_peoria_draw");
  const rows = players
    .map((p) => {
      const gross = p.scores.reduce<number>((a, b) => a + b!, 0);
      const sum = hidden.reduce(
        (n, i) => n + Math.min(p.scores[i]!, pars[i] * 2),
        0,
      );
      // ((sum * 1.5 - 72) * 0.8) in exact integer tenths; no floating tie drift.
      const handicap10 = Math.max(0, Math.min(360, sum * 12 - 576));
      return {
        slot_id: p.slot_id,
        gross,
        handicap: handicap10 / 10,
        net: (gross * 10 - handicap10) / 10,
        rank: 0,
      };
    })
    .sort((a, b) => a.net - b.net);
  const results: PeoriaResult[] = rows.map((r, i) => ({
    ...r,
    rank: i && r.net === rows[i - 1].net ? 0 : i + 1,
  }));
  for (let i = 1; i < results.length; i++)
    if (!results[i].rank) results[i].rank = results[i - 1].rank;
  return {
    algorithm_version: PEORIA_ALGORITHM,
    hidden_holes: hidden.map((i) => i + 1),
    results,
  };
}
