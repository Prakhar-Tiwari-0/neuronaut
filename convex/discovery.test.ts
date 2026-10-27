/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import type { FunctionReturnType } from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { BLOCKS_PER_LAYER, MAX_VISITS_PER_PAGE, NEURONS_PER_BLOCK, window as mapWindow } from "./discovery";
import { MODEL, neuronKey } from "./rules";
import schema from "./schema";

// Actual production queries and validators, an isolated database, and no live clients or inference.
const modules = import.meta.glob("./**/*.ts");
const DATE = "2026-10-27";
const pageOptions = { numItems: MAX_VISITS_PER_PAGE, cursor: null };
type VisitPage = FunctionReturnType<typeof api.discovery.visits>;
// The locked SDK exposes the registered function's original handler at runtime, but omits it from its public type.
// Only lookup instrumentation uses this; all behavioral/authorization tests invoke the public query references.
const windowHandler = (mapWindow as unknown as {
  _handler: (ctx: QueryCtx, args: { layer: number; block: number }) => Promise<FunctionReturnType<typeof api.discovery.window>>;
})._handler;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse(`${DATE}T12:00:00Z`));
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network forbidden in discovery tests"); }));
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function setup() {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ tokenIdentifier: "offline|alice", subject: "alice" });
  const bob = t.withIdentity({ tokenIdentifier: "offline|bob", subject: "bob" });
  await alice.mutation(api.players.join, { handle: "Alice" });
  await bob.mutation(api.players.join, { handle: "Bob" });
  const aliceId = (await alice.query(api.players.me, {}))!._id;
  const bobId = (await bob.query(api.players.me, {}))!._id;
  const visit = (playerId: Id<"players">, n: number, source: Doc<"scans">["source"] = "scan", layer = 0) =>
    t.run(ctx => ctx.db.insert("scans", { playerId, key: neuronKey(layer, n), layer, n, source, date: DATE }));
  const profile = (n: number, layer = 0) => t.run(ctx => ctx.db.insert("profiles", {
    key: neuronKey(layer, n), layer, n, texts: ["restricted profile output"], words: ["restricted profile word"],
    z: 8, nll: 1, distinct: 1, rarity: "epic", embedding: Array.from({ length: 256 }, (_, i) => Number(i === 0)), caught: false,
  }));
  const caught = (playerId: Id<"players">, n: number) => t.run(ctx => ctx.db.insert("catches", {
    playerId, key: neuronKey(0, n), layer: 0, n, name: "public catch", rarity: "epic", points: 60, uniqueness: 1, date: DATE,
  }));
  const snapshot = () => t.run(async ctx => ({
    players: await ctx.db.query("players").collect(), scans: await ctx.db.query("scans").collect(),
    profiles: await ctx.db.query("profiles").collect(), catches: await ctx.db.query("catches").collect(),
    jobs: await ctx.db.query("jobs").collect(), guesses: await ctx.db.query("guesses").collect(),
    results: await ctx.db.query("results").collect(), stats: await ctx.db.query("stats").collect(),
    dailies: await ctx.db.query("dailies").collect(), bounties: await ctx.db.query("bounties").collect(), entries: await ctx.db.query("entries").collect(),
  }));
  return { t, alice, bob, aliceId, bobId, visit, profile, caught, snapshot };
}

describe("window address boundaries", () => {
  for (let layer = 0; layer < MODEL.layers; layer++) {
    test(`layer ${layer}: first and last blocks contain exactly their real addresses`, async () => {
      const t = convexTest(schema, modules);
      for (const block of [0, BLOCKS_PER_LAYER - 1]) {
        const result = await t.query(api.discovery.window, { layer, block });
        const start = block * NEURONS_PER_BLOCK;
        expect(result).toMatchObject({ layer, block, start, end: start + 95 });
        expect(result.neurons.map(row => row.n)).toEqual(Array.from({ length: 96 }, (_, i) => start + i));
        expect(result.neurons.every(row => !row.visited && row.observation === "unknown" && row.caught === null)).toBe(true);
      }
    });
  }
  for (let block = 0; block < BLOCKS_PER_LAYER; block++) {
    test(`block ${block}: boundaries match the existing 96-neuron coverage bins`, async () => {
      const t = convexTest(schema, modules);
      const result = await t.query(api.discovery.window, { layer: 0, block });
      expect(result.neurons).toHaveLength(96);
      expect(result.start).toBe(block * 96);
      expect(result.end).toBe((block + 1) * 96 - 1);
      expect(result.end).toBeLessThan(MODEL.width);
    });
  }
  for (const field of ["layer", "block"] as const) {
    for (const value of [-1, 0.5, NaN, Infinity, -Infinity, field === "layer" ? MODEL.layers : BLOCKS_PER_LAYER]) {
      test(`reject ${field}=${String(value)}`, async () => {
        const t = convexTest(schema, modules);
        await expect(t.query(api.discovery.window, { layer: 0, block: 0, [field]: value }))
          .rejects.toThrow(field === "layer" ? "no neuron" : "Blocks are integers");
      });
    }
    test(`reject nonnumeric ${field}`, async () => {
      const t = convexTest(schema, modules);
      await expect(t.query(api.discovery.window, { layer: 0, block: 0, [field]: "0" } as never)).rejects.toThrow("Validator error");
    });
  }
});

describe("window authorization and observation states", () => {
  test("public catches are visible; another player's visits and hidden measurements are not", async () => {
    const { t, alice, bob, aliceId, visit, profile, caught } = await setup();
    await visit(aliceId, 0);
    await visit(aliceId, 1, "guess");
    await profile(0);
    await profile(2); // Measured but not visited/caught: even Alice cannot learn readiness from the map.
    await profile(3);
    await caught(aliceId, 3);
    await caught(aliceId, 4); // A missing observation must not be called unmeasured or necessarily pending.
    const own = await alice.query(api.discovery.window, { layer: 0, block: 0 });
    expect(own.neurons.slice(0, 5)).toEqual([
      { n: 0, visited: true, observation: "available", caught: null },
      { n: 1, visited: true, observation: "unavailable", caught: null },
      { n: 2, visited: false, observation: "unknown", caught: null },
      { n: 3, visited: false, observation: "available", caught: { mine: true } },
      { n: 4, visited: false, observation: "unavailable", caught: { mine: true } },
    ]);
    for (const viewer of [t, bob]) {
      const result = await viewer.query(api.discovery.window, { layer: 0, block: 0 });
      expect(result.neurons.slice(0, 3)).toEqual([0, 1, 2].map(n => ({ n, visited: false, observation: "unknown", caught: null })));
      expect(result.neurons[3]).toEqual({ n: 3, visited: false, observation: "available", caught: { mine: false } });
      expect(result.neurons[4]).toEqual({ n: 4, visited: false, observation: "unavailable", caught: { mine: false } });
    }
  });

  test("each player's visit state is independent, and duplicate visits produce one neuron", async () => {
    const { alice, bob, aliceId, bobId, visit } = await setup();
    await visit(aliceId, 0);
    await visit(aliceId, 0, "guess");
    await visit(bobId, 1, "guess");
    const a = await alice.query(api.discovery.window, { layer: 0, block: 0 });
    const b = await bob.query(api.discovery.window, { layer: 0, block: 0 });
    expect(a.neurons.filter(row => row.visited).map(row => row.n)).toEqual([0]);
    expect(b.neurons.filter(row => row.visited).map(row => row.n)).toEqual([1]);
    expect(a.neurons).toHaveLength(96);
  });

  test("an authenticated identity without a player has only public state", async () => {
    const { t, aliceId, visit } = await setup();
    await visit(aliceId, 0);
    const stranger = t.withIdentity({ tokenIdentifier: "offline|new" });
    expect(await stranger.query(api.discovery.window, { layer: 0, block: 0 }))
      .toEqual(await t.query(api.discovery.window, { layer: 0, block: 0 }));
  });

  test("job status does not become measurement truth, and completion can make an authorized observation available", async () => {
    const { t, alice, aliceId, visit, profile } = await setup();
    await visit(aliceId, 0);
    const id = await t.run(ctx => ctx.db.insert("jobs", {
      key: "profile:0:0", kind: "profile", args: { layer: 0, n: 0 }, priority: 0, status: "pending", by: aliceId,
    }));
    expect((await alice.query(api.discovery.window, { layer: 0, block: 0 })).neurons[0].observation).toBe("unavailable");
    await t.run(ctx => ctx.db.patch(id, { status: "failed" }));
    expect((await alice.query(api.discovery.window, { layer: 0, block: 0 })).neurons[0].observation).toBe("unavailable");
    await profile(0);
    expect((await alice.query(api.discovery.window, { layer: 0, block: 0 })).neurons[0].observation).toBe("available");
  });

  test("states match the existing card disclosure rule, including Daily-sourced visits", async () => {
    const { t, alice, aliceId, visit, profile, caught } = await setup();
    await visit(aliceId, 0, "guess");
    await profile(0);
    await profile(1);
    await profile(2);
    await caught(aliceId, 2);
    for (const viewer of [alice, t]) {
      const result = await viewer.query(api.discovery.window, { layer: 0, block: 0 });
      for (const n of [0, 1, 2, 3]) {
        const card = await viewer.query(api.neurons.card, { layer: 0, n });
        expect(result.neurons[n].visited).toBe(card.scanned);
        expect(result.neurons[n].observation).toBe(card.status === "ready" ? "available" : card.status === "hidden" ? "unknown" : "unavailable");
      }
    }
  });

  test("no private fields, embeddings, outputs, or unreleased puzzle data are returned", async () => {
    const { t, alice, aliceId, visit, profile } = await setup();
    await visit(aliceId, 0);
    await profile(0);
    await t.run(ctx => ctx.db.insert("dailies", {
      date: "2026-10-28", key: "0:0", layer: 0, n: 0, prompts: ["unreleased prompt"], texts: ["unreleased output"],
      baseline: ["unreleased baseline"], embedding: [1], ladder: { ranks: [1], cos: [1] }, band: [0, 7], hint: "unreleased hint",
    }));
    for (const viewer of [t, alice]) {
      const result = await viewer.query(api.discovery.window, { layer: 0, block: 0 });
      expect(Object.keys(result).sort()).toEqual(["layer", "block", "start", "end", "neurons"].sort());
      for (const row of result.neurons) expect(Object.keys(row).sort()).toEqual(["n", "visited", "observation", "caught"].sort());
      for (const sensitive of ["restricted profile output", "restricted profile word", "unreleased prompt", "unreleased output", "unreleased baseline", "unreleased hint", "offline|alice"]) {
        expect(JSON.stringify(result)).not.toContain(sensitive);
      }
    }
  });
});

describe("personal visits pagination", () => {
  test("signed-out and uninitialized accounts receive no private rows", async () => {
    const { t, aliceId, visit } = await setup();
    await visit(aliceId, 0);
    for (const viewer of [t, t.withIdentity({ tokenIdentifier: "offline|new" })]) {
      expect(await viewer.query(api.discovery.visits, { paginationOpts: pageOptions })).toEqual({ page: [], isDone: true, continueCursor: "" });
    }
  });

  test("only compact owner addresses and both legitimate source tags survive duplicate records", async () => {
    const { alice, bob, aliceId, bobId, visit } = await setup();
    await visit(aliceId, 0, "scan");
    await visit(aliceId, 0, "scan");
    await visit(aliceId, 0, "guess");
    await visit(bobId, 1, "guess");
    const own = await alice.query(api.discovery.visits, { paginationOpts: pageOptions });
    expect(own.isDone).toBe(true);
    expect(own.page).toEqual([{ layer: 0, n: 0, sources: ["guess", "scan"] }]);
    expect((await bob.query(api.discovery.visits, { paginationOpts: pageOptions })).page).toEqual([{ layer: 0, n: 1, sources: ["guess"] }]);
    expect(Object.keys(own.page[0]).sort()).toEqual(["layer", "n", "sources"]);
  });

  test("raw-row cursors preserve sources when duplicates span pages; clients union addresses across pages", async () => {
    const { alice, aliceId, visit } = await setup();
    await visit(aliceId, 0, "scan");
    await visit(aliceId, 0, "guess");
    await visit(aliceId, 0, "scan");
    await visit(aliceId, 1, "guess");
    const pages: VisitPage[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 5; i++) {
      const result: VisitPage = await alice.query(api.discovery.visits, { paginationOpts: { numItems: 1, cursor } });
      pages.push(result);
      if (result.isDone) break;
      expect(result.continueCursor).not.toBe(cursor);
      cursor = result.continueCursor;
    }
    expect(pages[pages.length - 1].isDone).toBe(true);
    expect(pages.flatMap(p => p.page)).toEqual([
      { layer: 0, n: 0, sources: ["scan"] }, { layer: 0, n: 0, sources: ["guess"] },
      { layer: 0, n: 0, sources: ["scan"] }, { layer: 0, n: 1, sources: ["guess"] },
    ]);
  });

  test("same-index cursors remain stable when earlier visits are inserted or removed", async () => {
    const { t, alice, aliceId, visit } = await setup();
    const early = await visit(aliceId, 10);
    await visit(aliceId, 20);
    await visit(aliceId, 30);
    const first = await alice.query(api.discovery.visits, { paginationOpts: { numItems: 1, cursor: null } });
    expect(first.page[0].n).toBe(10);
    await t.run(ctx => ctx.db.delete(early));
    await visit(aliceId, 1);
    const next = await alice.query(api.discovery.visits, { paginationOpts: { numItems: 1, cursor: first.continueCursor } });
    expect(next.page[0].n).toBe(20);
    expect(await alice.query(api.discovery.visits, { paginationOpts: { numItems: 1, cursor: first.continueCursor } })).toEqual(next);
  });

  test("the full bounded history is available beyond the old 60-record recent list", async () => {
    const { t, alice, aliceId } = await setup();
    await t.run(async ctx => {
      for (let n = 0; n < MAX_VISITS_PER_PAGE + 2; n++) await ctx.db.insert("scans", { playerId: aliceId, key: neuronKey(0, n), layer: 0, n, source: "scan", date: DATE });
    });
    const first = await alice.query(api.discovery.visits, { paginationOpts: pageOptions });
    expect(first.page).toHaveLength(MAX_VISITS_PER_PAGE);
    expect(first.isDone).toBe(false);
    const last = await alice.query(api.discovery.visits, { paginationOpts: { ...pageOptions, cursor: first.continueCursor } });
    expect(last.isDone).toBe(true);
    expect(last.page).toHaveLength(2);
    expect(new Set([...first.page, ...last.page].map(row => row.n)).size).toBe(MAX_VISITS_PER_PAGE + 2);
  });

  test("server caps override client read budgets and oversized reactive cursor ranges", async () => {
    const { t, alice, aliceId } = await setup();
    await t.run(async ctx => {
      for (let n = 0; n < MAX_VISITS_PER_PAGE * 2; n++) await ctx.db.insert("scans", { playerId: aliceId, key: neuronKey(0, n), layer: 0, n, source: "scan", date: DATE });
    });
    const first = await alice.query(api.discovery.visits, { paginationOpts: pageOptions });
    const second = await alice.query(api.discovery.visits, { paginationOpts: { ...pageOptions, cursor: first.continueCursor } });
    const bounded = await alice.query(api.discovery.visits, { paginationOpts: {
      numItems: 1, cursor: null, endCursor: second.continueCursor, maximumRowsRead: 100000, maximumBytesRead: 10000000,
    } });
    expect(bounded.page.length).toBeLessThanOrEqual(MAX_VISITS_PER_PAGE);
    expect(bounded.isDone).toBe(false);
    expect(bounded.pageStatus).toBe("SplitRequired");
    expect(bounded.splitCursor).toBeTruthy();
  });

  test("a cursor from another player never selects that player's history", async () => {
    const { alice, bob, aliceId, bobId, visit } = await setup();
    await visit(aliceId, 0);
    await visit(aliceId, 1);
    await visit(bobId, 99, "guess");
    const first = await alice.query(api.discovery.visits, { paginationOpts: { numItems: 1, cursor: null } });
    // convex-test can accept a foreign cursor position; deployed Convex may reject query-mismatched cursors instead.
    const result = await bob.query(api.discovery.visits, { paginationOpts: { numItems: 1, cursor: first.continueCursor } });
    expect(result.page.every(row => row.n === 99 && row.sources.join() === "guess")).toBe(true);
    expect((await bob.query(api.discovery.visits, { paginationOpts: pageOptions })).page).toEqual([{ layer: 0, n: 99, sources: ["guess"] }]);
  });

  for (const numItems of [0, -1, 0.5, NaN, Infinity, MAX_VISITS_PER_PAGE + 1]) {
    test(`reject page size ${String(numItems)}`, async () => {
      const t = convexTest(schema, modules);
      await expect(t.query(api.discovery.visits, { paginationOpts: { numItems, cursor: null } })).rejects.toThrow("visit records per page");
    });
  }
});

describe("read-only boundary and query cost", () => {
  test("forged ownership arguments are rejected by both public query validators", async () => {
    const { alice, aliceId } = await setup();
    await expect(alice.query(api.discovery.visits, { playerId: aliceId, paginationOpts: pageOptions } as never)).rejects.toThrow("Unexpected field `playerId`");
    await expect(alice.query(api.discovery.window, { playerId: aliceId, layer: 0, block: 0 } as never)).rejects.toThrow("Unexpected field `playerId`");
  });

  test("map reads never change gameplay records or enqueue jobs", async () => {
    const { t, alice, aliceId, visit, profile, caught, snapshot } = await setup();
    await visit(aliceId, 0);
    await profile(0);
    await caught(aliceId, 1);
    const before = await snapshot();
    for (const viewer of [alice, t]) {
      await viewer.query(api.discovery.visits, { paginationOpts: pageOptions });
      await viewer.query(api.discovery.window, { layer: 0, block: 0 });
    }
    expect(await snapshot()).toEqual(before);
    expect(before.jobs).toEqual([]);
  });

  test("hidden profiles and unrelated tables are never queried; window lookup count stays bounded", async () => {
    const { t, alice, aliceId, visit, profile } = await setup();
    await profile(0);
    // Instrument the actual handler against the real test database, not a replacement authorization algorithm.
    for (const viewer of [t, alice]) {
      const calls: string[] = [];
      await viewer.run(async ctx => {
        const db = new Proxy(ctx.db, { get(target, property, receiver) {
          if (property === "query") return (table: Parameters<typeof ctx.db.query>[0]) => {
            calls.push(table);
            return target.query(table);
          };
          if (["insert", "patch", "delete", "replace"].includes(String(property))) throw new Error("Query attempted a write");
          return Reflect.get(target, property, receiver);
        } });
        await windowHandler({ ...ctx, db }, { layer: 0, block: 0 });
      });
      expect(calls.filter(table => table === "catches")).toHaveLength(96);
      expect(calls.filter(table => table === "profiles")).toHaveLength(0);
      expect(calls.every(table => ["players", "catches", "scans"].includes(table))).toBe(true);
      expect(calls.length).toBeLessThanOrEqual(193);
    }
    await t.run(async ctx => {
      for (let n = 0; n < 96; n++) await ctx.db.insert("scans", { playerId: aliceId, key: neuronKey(0, n), layer: 0, n, source: "scan", date: DATE });
    });
    let count = 0;
    await alice.run(async ctx => {
      const db = new Proxy(ctx.db, { get(target, property, receiver) {
        if (property === "query") return (table: Parameters<typeof ctx.db.query>[0]) => { count++; return target.query(table); };
        return Reflect.get(target, property, receiver);
      } });
      await windowHandler({ ...ctx, db }, { layer: 0, block: 0 });
    });
    expect(count).toBe(289);
    // A real card/visit check remains available after instrumentation.
    await visit(aliceId, 96);
    expect((await alice.query(api.discovery.window, { layer: 0, block: 1 })).neurons[0].visited).toBe(true);
  });
});
