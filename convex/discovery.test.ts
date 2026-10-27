/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { MODEL, neuronKey } from "./rules";
import schema from "./schema";

// The map must show exactly what a neuron card would, and never another player's visits.
const modules = import.meta.glob("./**/*.ts");
const DATE = "2026-10-27";

async function setup() {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ tokenIdentifier: "test|alice" });
  const bob = t.withIdentity({ tokenIdentifier: "test|bob" });
  await alice.mutation(api.players.join, { handle: "alice" });
  await bob.mutation(api.players.join, { handle: "bob" });
  const aliceId = (await alice.query(api.players.me, {}))!._id;
  const visit = (playerId: Id<"players">, layer: number, n: number, source: Doc<"scans">["source"] = "scan") =>
    t.run((ctx) => ctx.db.insert("scans", { playerId, key: neuronKey(layer, n), layer, n, source, date: DATE }));
  const profile = (layer: number, n: number) =>
    t.run((ctx) =>
      ctx.db.insert("profiles", {
        key: neuronKey(layer, n), layer, n, texts: ["secret reply"], words: [], z: 8, nll: 1, distinct: 1, rarity: "epic",
        embedding: new Array(256).fill(0), caught: false,
      }),
    );
  const caught = (playerId: Id<"players">, layer: number, n: number) =>
    t.run((ctx) =>
      ctx.db.insert("catches", { playerId, key: neuronKey(layer, n), layer, n, name: "x", rarity: "epic", points: 60, uniqueness: 1, date: DATE }),
    );
  return { t, alice, bob, aliceId, visit, profile, caught };
}

test("a block is exactly its 96 indices, at both ends of the model", async () => {
  const t = convexTest(schema, modules);
  const last = await t.query(api.discovery.window, { layer: MODEL.layers - 1, block: 95 });
  expect([last.start, last.end]).toEqual([MODEL.width - 96, MODEL.width - 1]);
  expect(last.neurons.map((r) => r.n)).toEqual(Array.from({ length: 96 }, (_, i) => MODEL.width - 96 + i));
  expect((await t.query(api.discovery.window, { layer: 0, block: 0 })).neurons[0].n).toBe(0);
  for (const bad of [{ layer: 0, block: 96 }, { layer: 0, block: 0.5 }, { layer: MODEL.layers, block: 0 }])
    await expect(t.query(api.discovery.window, bad)).rejects.toThrow();
});

test("neighbouring layers and blocks don't leak into a window", async () => {
  // Range reads over (layer, n): an off-by-one at a block edge, or a missing layer bound, would show up here.
  const { alice, aliceId, visit } = await setup();
  await visit(aliceId, 3, 95);
  await visit(aliceId, 3, 192);
  await visit(aliceId, 4, 100);
  const w = await alice.query(api.discovery.window, { layer: 3, block: 1 });
  expect(w.neurons.filter((r) => r.visited).map((r) => r.n)).toEqual([]);
  await visit(aliceId, 3, 96);
  await visit(aliceId, 3, 191);
  const w2 = await alice.query(api.discovery.window, { layer: 3, block: 1 });
  expect(w2.neurons.filter((r) => r.visited).map((r) => r.n)).toEqual([96, 191]);
});

test("each neuron's state agrees with its card, for the visitor, another player, and signed out", async () => {
  const { t, alice, bob, aliceId, visit, profile, caught } = await setup();
  await visit(aliceId, 0, 0); // visited, measured
  await visit(aliceId, 0, 1, "guess"); // visited from a daily guess, not measured yet
  await profile(0, 2); // measured, but nobody may see it
  await profile(0, 3);
  await caught(aliceId, 0, 3); // caught, so public
  for (const viewer of [alice, bob, t]) {
    const w = await viewer.query(api.discovery.window, { layer: 0, block: 0 });
    for (const n of [0, 1, 2, 3, 4]) {
      const card = await viewer.query(api.neurons.card, { layer: 0, n });
      const row = w.neurons[n];
      expect(row.visited).toBe(card.scanned);
      expect(row.observation).toBe({ hidden: "unknown", ready: "available", pending: "unavailable" }[card.status]);
      expect(row.caught).toEqual(card.caught ? { mine: card.mine } : null);
    }
  }
  expect(JSON.stringify(await bob.query(api.discovery.window, { layer: 0, block: 0 }))).not.toContain("secret");
});

test("visits lists only the caller's neurons, paged, and nothing when signed out", async () => {
  const { t, alice, bob, aliceId, visit } = await setup();
  for (let n = 0; n < 130; n++) await visit(aliceId, 0, n, n % 2 ? "guess" : "scan");
  const first = await alice.query(api.discovery.visits, { paginationOpts: { numItems: 1000, cursor: null } });
  expect(first.page).toHaveLength(128); // the page cap holds whatever the client asks for
  expect(first.page[1]).toEqual({ layer: 0, n: 1, source: "guess" });
  const rest = await alice.query(api.discovery.visits, { paginationOpts: { numItems: 128, cursor: first.continueCursor } });
  expect([rest.isDone, rest.page.map((r) => r.n)]).toEqual([true, [128, 129]]);
  expect((await bob.query(api.discovery.visits, { paginationOpts: { numItems: 10, cursor: null } })).page).toEqual([]);
  expect(await t.query(api.discovery.visits, { paginationOpts: { numItems: 10, cursor: null } })).toEqual({ page: [], isDone: true, continueCursor: "" });
});
