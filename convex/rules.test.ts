// Daily ranks and heat. A wrong rank tells a player they're close when they aren't, which is the whole game, so these
// pin the ladder lookup against a brute-force count and the heat scale against what players should see.
import { describe, expect, test } from "vitest";
import { LADDER_EXACT, heat, ladderRank, type Ladder } from "./rules";

// A ladder built the way worker/store.py builds it, from a known list of cosines.
function ladderOf(all: number[]): Ladder {
  const cos = [...all].sort((a, b) => b - a);
  const ranks: number[] = [];
  for (let r = 1; r <= Math.min(cos.length, LADDER_EXACT); r++) ranks.push(r);
  for (let r = 2 * LADDER_EXACT; r < cos.length; r *= 2) ranks.push(r);
  if (cos.length > LADDER_EXACT) ranks.push(cos.length);
  return { ranks, cos: ranks.map((r) => cos[r - 1]) };
}

// Deterministic pseudo-random cosines, roughly how a daily answer's similarities to 50k neurons are spread.
function cosines(n: number) {
  let s = 1;
  return Array.from({ length: n }, () => {
    s = (s * 48271) % 2147483647;
    return Math.tanh((s / 2147483647 - 0.5) * 1.5) * 0.6;
  });
}

const all = cosines(50_000);
const ladder = ladderOf(all);
const trueRank = (c: number) => 1 + all.filter((x) => x > c).length;

describe("ladderRank", () => {
  test("is exact inside the top LADDER_EXACT", () => {
    const sorted = [...all].sort((a, b) => b - a);
    for (const r of [1, 2, 17, 500, LADDER_EXACT]) expect(ladderRank(ladder, sorted[r - 1])).toBe(r);
  });

  test("past the exact region, stays within the ladder bracket and tracks the true rank", () => {
    const sorted = [...all].sort((a, b) => b - a);
    for (const r of [1500, 3000, 9000, 20000, 45000]) {
      const got = ladderRank(ladder, sorted[r - 1]);
      expect(got / trueRank(sorted[r - 1])).toBeGreaterThan(0.75);
      expect(got / trueRank(sorted[r - 1])).toBeLessThan(1.33);
    }
  });

  test("never increases as the guess gets closer", () => {
    const ranks = Array.from({ length: 141 }, (_, i) => ladderRank(ladder, -0.7 + i * 0.01));
    for (let i = 1; i < ranks.length; i++) expect(ranks[i]).toBeLessThanOrEqual(ranks[i - 1]);
  });

  test("clamps above the closest neuron and below the farthest", () => {
    expect(ladderRank(ladder, 1)).toBe(1);
    expect(ladderRank(ladder, -1)).toBe(all.length);
  });

  test("works when only a few neurons are measured", () => {
    const small = ladderOf([0.5, 0.2, -0.1]);
    expect(ladderRank(small, 0.6)).toBe(1);
    expect(ladderRank(small, 0.2)).toBe(2);
    expect(ladderRank(small, -0.5)).toBe(3);
    expect(ladderRank({ ranks: [], cos: [] }, 0.3)).toBe(1);
  });
});

describe("heat", () => {
  const N = 294_912;

  test("a random guess is cold, the top 500 is about half, the closest wrong guess is 99", () => {
    expect(heat(N / 2, N)).toBeLessThanOrEqual(6);
    expect(heat(500, N)).toBeGreaterThanOrEqual(45);
    expect(heat(500, N)).toBeLessThanOrEqual(55);
    expect(heat(1, N)).toBe(99);
  });

  test("falls as rank grows and stays in 0..99", () => {
    const hs = [1, 2, 10, 100, 1000, 10_000, 100_000, N].map((r) => heat(r, N));
    for (let i = 1; i < hs.length; i++) expect(hs[i]).toBeLessThanOrEqual(hs[i - 1]);
    expect(Math.min(...hs)).toBeGreaterThanOrEqual(0);
  });

  test("still sensible with a tiny measured set", () => {
    expect(heat(1, 1)).toBe(99);
    expect(heat(2, 3)).toBeGreaterThanOrEqual(0);
  });
});
