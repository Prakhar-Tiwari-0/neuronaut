/// <reference types="vite/client" />
// Real handlers, validators and indexes in convex-test's isolated database. No live clients or inference.
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { dailyPoints } from "./daily";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const SECRET = "offline-authorization-worker-secret";
const DATE = "2026-10-27";
const NOW = Date.parse(`${DATE}T12:00:00Z`);
const axis = (i: number) => Array.from({ length: 256 }, (_, j) => Number(i === j));
const pushes = [{ layer: 1, n: 1, dose: 0.6 }];
const ladder = { ranks: [1, 2], cos: [0.5, 0] };
const profile = (n: number, embedding = axis(n)) => ({
  layer: 1, n, texts: [`private reply ${n}`], words: [`word${n}`], z: 5, nll: 2, distinct: 0.9, embedding,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("WORKER_SECRET", SECRET);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network access is forbidden in authorization tests"); }));
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function setup() {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "alice", issuer: "https://offline.clerk.test", tokenIdentifier: "offline|alice" });
  const bob = t.withIdentity({ subject: "bob", issuer: "https://offline.clerk.test", tokenIdentifier: "offline|bob" });
  await alice.mutation(api.players.join, { handle: "Alice" });
  await bob.mutation(api.players.join, { handle: "Bob" });
  const aliceId = (await alice.query(api.players.me, {}))!._id;
  const bobId = (await bob.query(api.players.me, {}))!._id;
  const seedProfile = async (n: number) => t.run(ctx => ctx.db.insert("profiles", {
    ...profile(n), key: `1:${n}`, caught: false, rarity: "rare",
  }));
  const seedDaily = async () => t.run(ctx => ctx.db.insert("dailies", {
    date: DATE, key: "1:99", layer: 1, n: 99, prompts: ["public prompt"], texts: ["public clue"],
    baseline: ["public baseline"], embedding: axis(0), ladder, band: [0, 7], hint: "private hint",
  }));
  const seedBounty = async () => t.run(ctx => ctx.db.insert("bounties", {
    slug: "isolation", title: "Isolation", brief: "Public brief", maxNeurons: 2,
    prompts: ["private judge prompt"], anchors: ["private judge anchor"],
    startsAt: NOW - 1000, endsAt: NOW + 1000, settled: false,
    par: { score: 1, pushes: [{ layer: 3, n: 3, dose: 0.5 }] },
  }));
  const snapshot = () => t.run(async ctx => ({
    players: await ctx.db.query("players").collect(), scans: await ctx.db.query("scans").collect(),
    guesses: await ctx.db.query("guesses").collect(), results: await ctx.db.query("results").collect(),
    entries: await ctx.db.query("entries").collect(), jobs: await ctx.db.query("jobs").collect(),
    catches: await ctx.db.query("catches").collect(), profiles: await ctx.db.query("profiles").collect(),
    stats: await ctx.db.query("stats").collect(), bounties: await ctx.db.query("bounties").collect(),
    dailies: await ctx.db.query("dailies").collect(),
  }));
  return { t, alice, bob, aliceId, bobId, seedProfile, seedDaily, seedBounty, snapshot };
}

describe("private player reads", () => {
  test("uncaught measured profiles and scan histories belong to the authenticated player", async () => {
    const { t, alice, bob, seedProfile } = await setup();
    await seedProfile(1);
    await seedProfile(2);
    await alice.mutation(api.neurons.scan, { layer: 1, n: 1 });
    await bob.mutation(api.neurons.scan, { layer: 1, n: 2 });
    for (const [owner, other, n] of [[alice, bob, 1], [bob, alice, 2]] as const) {
      const own = await owner.query(api.neurons.card, { layer: 1, n });
      expect(own.profile?.texts).toEqual([`private reply ${n}`]);
      expect(own.scanned).toBe(true);
      for (const viewer of [other, t]) {
        expect(await viewer.query(api.neurons.card, { layer: 1, n })).toMatchObject({ scanned: false, status: "hidden", profile: null });
      }
      expect((await owner.query(api.neurons.seen, {})).map(s => s.n)).toEqual([n]);
      expect((await other.query(api.neurons.seen, {})).some(s => s.n === n)).toBe(false);
    }
    expect(await t.query(api.neurons.seen, {})).toEqual([]);
  });

  test("Daily guesses, finished answers, hints and results do not follow another player's solve", async () => {
    const { t, alice, bob, seedDaily } = await setup();
    await seedDaily();
    await t.mutation(api.worker.putProfiles, { secret: SECRET, jobIds: [], profiles: [profile(1, axis(0)), profile(2)] });
    await alice.mutation(api.daily.guess, { layer: 1, n: 1 });
    await bob.mutation(api.daily.guess, { layer: 1, n: 2 });
    const a = (await alice.query(api.daily.current, {}))!;
    const b = (await bob.query(api.daily.current, {}))!;
    const publicView = (await t.query(api.daily.current, {}))!;
    expect(a.result?.solved).toBe(true);
    expect(a.answer).toEqual({ layer: 1, n: 99 });
    expect(a.guesses.map(g => g.n)).toEqual([1]);
    expect(b.guesses.map(g => g.n)).toEqual([2]);
    for (const view of [b, publicView]) {
      expect(view).toMatchObject({ result: null, answer: null, band: null, hint: null, players: 1, solvers: 1 });
    }
    expect(publicView.guesses).toEqual([]);
    expect((await alice.query(api.players.me, {}))!.points).toBe(dailyPoints(1));
    expect((await bob.query(api.players.me, {}))!.points).toBe(0);
  });

  test("bounty submissions and judged replies stay private until the documented closing boundary", async () => {
    const { t, alice, bob, seedBounty } = await setup();
    await seedBounty();
    await alice.mutation(api.bounties.submit, { slug: "isolation", pushes });
    await bob.mutation(api.bounties.submit, { slug: "isolation", pushes: [{ layer: 2, n: 2, dose: -0.5 }] });
    const job = (await t.run(ctx => ctx.db.query("jobs").collect())).find(j => j.args.pushes[0].layer === 1)!;
    await t.mutation(api.worker.finishJudge, {
      secret: SECRET, id: job._id, entryId: job.args.entryId, score: 700, concept: 0.8, coherence: 0.9, texts: ["alice private judged reply"],
    });
    const a = (await alice.query(api.bounties.get, { slug: "isolation" }))!;
    const b = (await bob.query(api.bounties.get, { slug: "isolation" }))!;
    expect(a.mine).toHaveLength(1);
    expect(a.mine[0]).toMatchObject({ pushes, texts: ["alice private judged reply"], score: 700 });
    expect(b.mine).toHaveLength(1);
    expect(b.mine[0]).toMatchObject({ pushes: [{ layer: 2, n: 2, dose: -0.5 }], texts: [], score: null });
    for (const viewer of [bob, t]) {
      const view = (await viewer.query(api.bounties.get, { slug: "isolation" }))!;
      expect(view.parPushes).toBeNull();
      expect(view.leaderboard[0]).toMatchObject({ handle: "Alice", score: 700, pushes: null, texts: null });
      expect(JSON.stringify(view)).not.toContain("alice private judged reply");
      for (const hidden of ["private judge prompt", "private judge anchor"]) expect(JSON.stringify(view)).not.toContain(hidden);
    }
    expect((await t.query(api.bounties.get, { slug: "isolation" }))!.mine).toEqual([]);
    vi.setSystemTime(NOW + 2000);
    const closed = (await t.query(api.bounties.get, { slug: "isolation" }))!;
    expect(closed.leaderboard[0]).toMatchObject({ pushes, texts: ["alice private judged reply"] });
    for (const hidden of ["private judge prompt", "private judge anchor"]) expect(JSON.stringify(closed)).not.toContain(hidden);
  });
});

describe("public projections", () => {
  test("leaderboards and public profiles exclude identity and private progress records", async () => {
    const { t, alice, seedProfile } = await setup();
    await seedProfile(1);
    await alice.mutation(api.neurons.scan, { layer: 1, n: 1 });
    const leaderboard = await t.query(api.players.leaderboard, {});
    expect(leaderboard).toHaveLength(2);
    for (const row of leaderboard) expect(Object.keys(row).sort()).toEqual([
      "handle", "points", "caught", "dailySolved", "streak", "bestStreak", "bountyWins",
    ].sort());
    const publicPlayer = (await t.query(api.players.profile, { handle: "ALICE" }))!;
    expect(Object.keys(publicPlayer).sort()).toEqual([
      "handle", "points", "dailySolved", "streak", "bestStreak", "bountyWins", "catches",
    ].sort());
    expect(publicPlayer.catches).toEqual([]);
    expect(publicPlayer.handle).toBe("Alice");
  });

  test("caught observations are public but embeddings, player bindings and raw documents are withheld", async () => {
    const { t, alice, bob, seedProfile } = await setup();
    await seedProfile(1);
    await alice.mutation(api.neurons.scan, { layer: 1, n: 1 });
    await alice.action(api.neurons.catchNeuron, { layer: 1, n: 1, name: "Public catch" });
    for (const viewer of [bob, t]) {
      const card = await viewer.query(api.neurons.card, { layer: 1, n: 1 });
      expect(card.mine).toBe(false);
      expect(card.profile?.texts).toEqual(["private reply 1"]); // Catching intentionally publishes this observation.
      expect(Object.keys(card.profile!).sort()).toEqual(["texts", "words", "z", "nll", "distinct", "rarity"].sort());
      expect(Object.keys(card.caught!).sort()).toEqual(["handle", "name", "points", "uniqueness"].sort());
      const dex = await viewer.query(api.neurons.dex, { paginationOpts: { numItems: 10, cursor: null } });
      expect(Object.keys(dex.page[0]).sort()).toEqual(["layer", "n", "name", "rarity", "points", "handle", "words", "at"].sort());
      const overview = await viewer.query(api.neurons.overview, {});
      expect(Object.keys(overview.recent[0]).sort()).toEqual(["layer", "n", "name", "rarity", "handle", "at"].sort());
      const publicPlayer = (await viewer.query(api.players.profile, { handle: "Alice" }))!;
      expect(Object.keys(publicPlayer.catches[0]).sort()).toEqual(["layer", "n", "name", "rarity", "points", "date"].sort());
      expect(JSON.stringify({ card, dex, overview })).not.toContain("offline|alice");
    }
  });
});

describe("restricted calls and forged ownership", () => {
  test("signed-out callers cannot join, scan, guess or catch, and rejection writes nothing", async () => {
    const { t, snapshot } = await setup();
    const before = await snapshot();
    await expect(t.mutation(api.players.join, { handle: "Guest" })).rejects.toThrow("Sign in first");
    await expect(t.mutation(api.neurons.scan, { layer: 1, n: 1 })).rejects.toThrow("Sign in first");
    await expect(t.mutation(api.daily.guess, { layer: 1, n: 1 })).rejects.toThrow("Sign in first");
    await expect(t.mutation(api.bounties.submit, { slug: "isolation", pushes })).rejects.toThrow("Sign in first");
    await expect(t.action(api.neurons.catchNeuron, { layer: 1, n: 1, name: "No access" })).rejects.toThrow("Sign in first");
    expect(await snapshot()).toEqual(before);
  });

  test("an authenticated identity without a player cannot use gameplay mutations", async () => {
    const { t, snapshot } = await setup();
    const caller = t.withIdentity({ subject: "new", tokenIdentifier: "offline|new" });
    const before = await snapshot();
    await expect(caller.mutation(api.neurons.scan, { layer: 1, n: 1 })).rejects.toThrow("Pick a handle first");
    await expect(caller.mutation(api.daily.guess, { layer: 1, n: 1 })).rejects.toThrow("Pick a handle first");
    await expect(caller.mutation(api.bounties.submit, { slug: "isolation", pushes })).rejects.toThrow("Pick a handle first");
    await expect(caller.action(api.neurons.catchNeuron, { layer: 1, n: 1, name: "No player" })).rejects.toThrow("Pick a handle first");
    expect(await snapshot()).toEqual(before);
  });

  for (const field of ["playerId", "handle", "userId", "isAuthenticated", "emailVerified"] as const) {
    test(`client-supplied ${field} cannot select or authorize another player`, async () => {
      const { t, bob, aliceId, seedBounty, snapshot } = await setup();
      await seedBounty();
      const forged = { [field]: field === "playerId" ? aliceId : field === "handle" ? "Alice" : field === "userId" ? "offline|alice" : true };
      const before = await snapshot();
      const error = `Validator error: Unexpected field \`${field}\` in object`;
      // Deliberately bypass compile-time argument checks to exercise the actual runtime validators.
      for (const caller of [bob, t]) {
        await expect(caller.query(api.players.me, forged as never)).rejects.toThrow(error);
        await expect(caller.query(api.neurons.seen, forged as never)).rejects.toThrow(error);
        await expect(caller.query(api.neurons.card, { layer: 1, n: 1, ...forged } as never)).rejects.toThrow(error);
        await expect(caller.query(api.daily.current, forged as never)).rejects.toThrow(error);
        await expect(caller.query(api.bounties.get, { slug: "isolation", ...forged } as never)).rejects.toThrow(error);
        await expect(caller.mutation(api.neurons.scan, { layer: 1, n: 1, ...forged } as never)).rejects.toThrow(error);
        await expect(caller.mutation(api.daily.guess, { layer: 1, n: 1, ...forged } as never)).rejects.toThrow(error);
        await expect(caller.mutation(api.bounties.submit, { slug: "isolation", pushes, ...forged } as never)).rejects.toThrow(error);
        await expect(caller.action(api.neurons.catchNeuron, { layer: 1, n: 1, name: "Forged", ...forged } as never)).rejects.toThrow(error);
      }
      expect(await snapshot()).toEqual(before);
    });
  }

  test("a Clerk nickname matching the victim's handle and a verified-contact claim do not grant ownership", async () => {
    const { t, aliceId, seedProfile } = await setup();
    await seedProfile(1);
    const impostor = t.withIdentity({ subject: "impostor", tokenIdentifier: "offline|impostor", nickname: "Alice", emailVerified: true });
    expect(await impostor.query(api.players.me, {})).toBeNull();
    await expect(impostor.mutation(api.neurons.scan, { layer: 1, n: 1 })).rejects.toThrow("Pick a handle first");
    await expect(impostor.mutation(api.players.join, { handle: "alice" })).rejects.toThrow("taken");
    await impostor.mutation(api.players.join, { handle: "Impostor" });
    expect((await impostor.query(api.players.me, {}))!._id).not.toBe(aliceId);
    expect((await impostor.query(api.neurons.card, { layer: 1, n: 1 })).profile).toBeNull();
  });
});

describe("catch authorization through action and internal boundaries", () => {
  test("another player's scan is insufficient for both public catch and internal preflight", async () => {
    const { alice, bob, seedProfile, snapshot } = await setup();
    await seedProfile(1);
    await alice.mutation(api.neurons.scan, { layer: 1, n: 1 });
    const before = await snapshot();
    await expect(bob.query(internal.neurons.catchCheck, { layer: 1, n: 1 })).rejects.toThrow("Scan it before you catch it");
    await expect(bob.action(api.neurons.catchNeuron, { layer: 1, n: 1, name: "Stolen" })).rejects.toThrow("Scan it before you catch it");
    expect(await snapshot()).toEqual(before);
  });

  test("internal preflight and commit independently reject unauthenticated callers", async () => {
    const { t, snapshot } = await setup();
    const before = await snapshot();
    // Test harness invocation of an internal reference is not a public network route.
    await expect(t.query(internal.neurons.catchCheck, { layer: 1, n: 1 })).rejects.toThrow("Sign in first");
    await expect(t.mutation(internal.neurons.catchCommit, { layer: 1, n: 1, name: "No auth", uniqueness: 1 })).rejects.toThrow("Sign in first");
    expect(await snapshot()).toEqual(before);
  });

  test("the public catch action propagates its caller to commit and cannot transfer another player's catch", async () => {
    const { t, alice, bob, aliceId, bobId, seedProfile, snapshot } = await setup();
    await seedProfile(1);
    for (const caller of [alice, bob]) await caller.mutation(api.neurons.scan, { layer: 1, n: 1 });
    await bob.action(api.neurons.catchNeuron, { layer: 1, n: 1, name: "Bob's catch" });
    const record = (await t.run(ctx => ctx.db.query("catches").collect()))[0];
    expect(record.playerId).toBe(bobId);
    expect(record.playerId).not.toBe(aliceId);
    expect((await bob.query(api.players.me, {}))!.caught).toBe(1);
    expect((await alice.query(api.players.me, {}))!.caught).toBe(0);
    const before = await snapshot();
    await expect(alice.action(api.neurons.catchNeuron, { layer: 1, n: 1, name: "Overwrite" })).rejects.toThrow("already caught");
    expect(await snapshot()).toEqual(before);
  });
});

describe("identity initialization", () => {
  test("repeat initialization and case-insensitive handle collisions leave bindings unchanged", async () => {
    const { t, alice, bob, snapshot } = await setup();
    const before = await snapshot();
    await expect(alice.mutation(api.players.join, { handle: "AliceAgain" })).rejects.toThrow("already have a handle");
    const newcomer = t.withIdentity({ subject: "new", tokenIdentifier: "offline|new" });
    await expect(newcomer.mutation(api.players.join, { handle: "aLiCe" })).rejects.toThrow("taken");
    await expect(bob.mutation(api.players.join, { handle: "Alice" })).rejects.toThrow("already have a handle");
    expect(await snapshot()).toEqual(before);
  });

  test("equal subjects at different issuers resolve to different players", async () => {
    const { t } = await setup();
    const a = t.withIdentity({ subject: "shared", issuer: "https://issuer-a.test", tokenIdentifier: "issuer-a|shared" });
    const b = t.withIdentity({ subject: "shared", issuer: "https://issuer-b.test", tokenIdentifier: "issuer-b|shared" });
    await a.mutation(api.players.join, { handle: "IssuerA" });
    expect(await b.query(api.players.me, {})).toBeNull();
    await b.mutation(api.players.join, { handle: "IssuerB" });
    expect((await a.query(api.players.me, {}))!._id).not.toBe((await b.query(api.players.me, {}))!._id);
  });

  test("client identity claims cannot be supplied when initializing a player", async () => {
    const { t, aliceId, snapshot } = await setup();
    const newcomer = t.withIdentity({ subject: "new", tokenIdentifier: "offline|new" });
    const before = await snapshot();
    for (const forged of [{ userId: "offline|alice" }, { playerId: aliceId }, { isAuthenticated: true }]) {
      for (const caller of [newcomer, t]) {
        await expect(caller.mutation(api.players.join, { handle: "Newcomer", ...forged } as never))
          .rejects.toThrow(`Validator error: Unexpected field \`${Object.keys(forged)[0]}\` in object`);
      }
    }
    expect(await snapshot()).toEqual(before);
  });
});

describe("worker credential boundary", () => {
  for (const endpoint of ["pending", "claim", "fail", "putProfiles", "putBaseline", "finishJudge", "putPar", "putDaily", "upcomingDailies", "setLadder", "putSwept"] as const) {
    for (const credential of ["wrong", "empty", "omitted", "unconfigured"] as const) {
      test(`${endpoint} rejects ${credential} worker credentials, even for a signed-in player`, async () => {
        const { t, bob, bobId, seedBounty, seedDaily, snapshot } = await setup();
        const bountyId = await seedBounty();
        const dailyId = await seedDaily();
        const { entryId, jobId } = await t.run(async ctx => {
          const entryId = await ctx.db.insert("entries", { playerId: bobId, bountyId, pushes, status: "pending" });
          const jobId = await ctx.db.insert("jobs", { kind: "judge", key: "offline-worker-job", args: { entryId }, priority: 0, status: "pending", by: bobId });
          return { entryId, jobId };
        });
        if (credential === "unconfigured") vi.stubEnv("WORKER_SECRET", undefined);
        const credentials = credential === "omitted" ? {} : { secret: credential === "empty" ? "" : credential === "unconfigured" ? SECRET : "wrong-secret" };
        // All other arguments are valid fixtures. Cast only to send intentionally missing credentials past TS.
        const calls: Record<typeof endpoint, (caller: Pick<typeof t, "query" | "mutation">) => Promise<unknown>> = {
          pending: caller => caller.query(api.worker.pending, credentials as never),
          claim: caller => caller.mutation(api.worker.claim, { ...credentials, max: 1 } as never),
          fail: caller => caller.mutation(api.worker.fail, { ...credentials, id: jobId, error: "unauthorized" } as never),
          putProfiles: caller => caller.mutation(api.worker.putProfiles, { ...credentials, jobIds: [jobId], profiles: [profile(1)] } as never),
          putBaseline: caller => caller.mutation(api.worker.putBaseline, { ...credentials, prompts: ["unauthorized"], texts: ["unauthorized"] } as never),
          finishJudge: caller => caller.mutation(api.worker.finishJudge, { ...credentials, id: jobId, entryId, score: 999, concept: 1, coherence: 1, texts: ["unauthorized"] } as never),
          putPar: caller => caller.mutation(api.worker.putPar, { ...credentials, id: jobId, slug: "isolation", score: 999, pushes } as never),
          putDaily: caller => caller.mutation(api.worker.putDaily, {
            ...credentials, id: jobId, date: "2026-10-28", layer: 1, n: 1, prompts: [], texts: [], baseline: [],
            embedding: axis(0), band: [0, 7], hint: "unauthorized", ladder,
          } as never),
          upcomingDailies: caller => caller.query(api.worker.upcomingDailies, credentials as never),
          setLadder: caller => caller.mutation(api.worker.setLadder, { ...credentials, id: dailyId, ladder: { ranks: [1], cos: [1] } } as never),
          putSwept: caller => caller.mutation(api.worker.putSwept, { ...credentials, swept: 999 } as never),
        };
        const before = await snapshot();
        for (const caller of [t, bob]) {
          const denied = expect(calls[endpoint](caller)).rejects;
          if (credential === "omitted") await denied.toThrow("Validator error: Missing required field `secret` in object"); // Runtime argument validation, not the secret guard.
          else await denied.toThrow("bad worker secret");
          expect(await snapshot()).toEqual(before);
        }
      });
    }
  }
});

describe("asynchronous owner association", () => {
  test("a player cannot forge another player's judge completion or replace an existing entry", async () => {
    const { t, alice, bob, aliceId, bobId, seedBounty, snapshot } = await setup();
    await seedBounty();
    await alice.mutation(api.bounties.submit, { slug: "isolation", pushes });
    const job = (await t.run(ctx => ctx.db.query("jobs").collect()))[0];
    expect(job.by).toBe(aliceId);
    const before = await snapshot();
    await expect(bob.mutation(api.worker.finishJudge, {
      secret: "wrong", id: job._id, entryId: job.args.entryId, score: 0, concept: 0, coherence: 0, texts: ["forged"],
    })).rejects.toThrow("bad worker secret");
    await expect(bob.mutation(api.bounties.submit, {
      slug: "isolation", pushes, entryId: job.args.entryId,
    } as never)).rejects.toThrow("Validator error: Unexpected field `entryId` in object");
    expect(await snapshot()).toEqual(before);
    await bob.mutation(api.bounties.submit, { slug: "isolation", pushes });
    const entries = await t.run(ctx => ctx.db.query("entries").collect());
    expect(entries).toHaveLength(2);
    expect(entries.map(e => e.playerId).sort()).toEqual([aliceId, bobId].sort());
    await bob.mutation(api.worker.finishJudge, {
      secret: SECRET, id: job._id, entryId: job.args.entryId, score: 500, concept: 0.5, coherence: 1, texts: ["Alice's result"],
    });
    expect((await alice.query(api.bounties.get, { slug: "isolation" }))!.mine[0].texts).toEqual(["Alice's result"]);
    expect((await bob.query(api.bounties.get, { slug: "isolation" }))!.mine[0].texts).toEqual([]);
  });

  test("profile completion settles the stored guess owner rather than the callback caller", async () => {
    const { t, alice, bob, aliceId, seedDaily } = await setup();
    await seedDaily();
    await alice.mutation(api.daily.guess, { layer: 1, n: 1 });
    await bob.mutation(api.daily.guess, { layer: 1, n: 2 });
    const jobs = await t.run(ctx => ctx.db.query("jobs").collect());
    const job = jobs.find(j => j.key === "profile:1:1")!;
    expect(job.by).toBe(aliceId);
    // Even when the trusted callback has Bob's Clerk context, its destination is Alice's persisted guess.
    await bob.mutation(api.worker.putProfiles, { secret: SECRET, jobIds: [job._id], profiles: [profile(1, axis(0))] });
    expect((await alice.query(api.daily.current, {}))!.result?.solved).toBe(true);
    expect((await bob.query(api.daily.current, {}))!).toMatchObject({ result: null, answer: null });
    expect((await bob.query(api.daily.current, {}))!.guesses).toMatchObject([{ n: 2, status: "pending" }]);
    expect((await alice.query(api.players.me, {}))!.points).toBe(dailyPoints(1));
    expect((await bob.query(api.players.me, {}))!.points).toBe(0);
    expect((await t.query(api.daily.current, {}))!.guesses).toEqual([]);
  });

  test("a deduplicated shared profile resolves each owner's guesses without granting observers access", async () => {
    const { t, alice, bob, seedDaily } = await setup();
    await seedDaily();
    for (const caller of [alice, bob]) await caller.mutation(api.daily.guess, { layer: 1, n: 1 });
    const jobs = await t.run(ctx => ctx.db.query("jobs").collect());
    expect(jobs).toHaveLength(1);
    await t.mutation(api.worker.putProfiles, { secret: SECRET, jobIds: [jobs[0]._id], profiles: [profile(1, axis(0))] });
    for (const caller of [alice, bob]) {
      expect((await caller.query(api.daily.current, {}))!.result?.solved).toBe(true);
      expect((await caller.query(api.players.me, {}))!.points).toBe(dailyPoints(1));
    }
    expect((await t.query(api.daily.current, {}))!).toMatchObject({ guesses: [], result: null, answer: null });
    expect(await t.run(ctx => ctx.db.query("jobs").collect())).toHaveLength(1);
  });

  test("a failed profile callback refunds only guesses associated with its neuron", async () => {
    const { t, alice, bob, seedDaily } = await setup();
    await seedDaily();
    await alice.mutation(api.daily.guess, { layer: 1, n: 1 });
    await bob.mutation(api.daily.guess, { layer: 1, n: 2 });
    const job = (await t.run(ctx => ctx.db.query("jobs").collect())).find(j => j.key === "profile:1:1")!;
    await t.mutation(api.worker.fail, { secret: SECRET, id: job._id, error: "offline synthetic failure" });
    expect((await alice.query(api.daily.current, {}))!.guesses).toEqual([]);
    expect((await bob.query(api.daily.current, {}))!.guesses).toMatchObject([{ n: 2, status: "pending" }]);
    expect((await bob.query(api.players.me, {}))!.points).toBe(0);
  });
});
