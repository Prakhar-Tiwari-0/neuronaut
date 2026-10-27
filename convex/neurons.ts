import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { action, internalMutation, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import { bumpStats, enqueue, globalStats } from "./jobs";
import { LIMITS, MODEL, POINTS, type Rarity, neuronKey, playerFor, requirePlayer, today, validNeuron } from "./lib";

async function profileOf(ctx: QueryCtx, key: string) {
  return await ctx.db.query("profiles").withIndex("by_key", (q) => q.eq("key", key)).unique();
}

async function catchOf(ctx: QueryCtx, key: string) {
  return await ctx.db.query("catches").withIndex("by_key", (q) => q.eq("key", key)).unique();
}

function publicProfile(p: Doc<"profiles">) {
  return { texts: p.texts, words: p.words, z: p.z, nll: p.nll, distinct: p.distinct, rarity: p.rarity as Rarity };
}

// Lens search: neurons whose steer or logit lens contains the words. Free, needs no GPU, and is the main way to hunt.
export const search = query({
  args: { q: v.string(), layer: v.optional(v.number()) },
  handler: async (ctx, { q, layer }) => {
    if (!q.trim()) return [];
    const rows = await ctx.db
      .query("neurons")
      .withSearchIndex("search_terms", (s) => (layer === undefined ? s.search("terms", q) : s.search("terms", q).eq("layer", layer)))
      .take(60);
    return rows.map((r) => ({ layer: r.layer, n: r.n, steer: r.steer.slice(0, 8), lens: r.lens.slice(0, 4) }));
  },
});

// A neuron's card. The measured profile shows only once this player has scanned or guessed it, or someone caught it.
export const card = query({
  args: { token: v.optional(v.string()), layer: v.number(), n: v.number() },
  handler: async (ctx, { token, layer, n }) => {
    validNeuron(layer, n);
    const key = neuronKey(layer, n);
    const row = await ctx.db.query("neurons").withIndex("by_ln", (q) => q.eq("layer", layer).eq("n", n)).unique();
    const player = await playerFor(ctx, token);
    const scanned = player
      ? !!(await ctx.db.query("scans").withIndex("by_player_key", (q) => q.eq("playerId", player._id).eq("key", key)).first())
      : false;
    const caught = await catchOf(ctx, key);
    const owner = caught ? await ctx.db.get(caught.playerId) : null;
    const visible = scanned || !!caught;
    const prof = visible ? await profileOf(ctx, key) : null;
    return {
      layer,
      n,
      steer: row?.steer ?? [],
      lens: row?.lens ?? [],
      scanned,
      status: !visible ? "hidden" : prof ? "ready" : "pending",
      profile: prof ? publicProfile(prof) : null,
      caught: caught ? { handle: owner?.handle ?? "?", name: caught.name, points: caught.points, uniqueness: caught.uniqueness } : null,
      mine: !!(caught && player && caught.playerId === player._id),
    };
  },
});

// Spends a scan to reveal a neuron's card (queues the GPU if nobody measured it yet). No layer/n = a random neuron.
// Rescanning a neuron you have already seen is free.
export const scan = mutation({
  args: { token: v.string(), layer: v.optional(v.number()), n: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const player = await requirePlayer(ctx, args.token);
    let { layer, n } = args;
    if (layer === undefined || n === undefined) {
      layer = Math.floor(Math.random() * MODEL.layers);
      n = Math.floor(Math.random() * MODEL.width);
    }
    validNeuron(layer, n);
    const key = neuronKey(layer, n);
    const seen = await ctx.db.query("scans").withIndex("by_player_key", (q) => q.eq("playerId", player._id).eq("key", key)).first();
    if (seen) return { layer, n };
    const date = today();
    const used = (await ctx.db.query("scans").withIndex("by_player_date", (q) => q.eq("playerId", player._id).eq("date", date)).collect())
      .filter((s) => s.source === "scan").length;
    if (used >= LIMITS.scans) throw new ConvexError(`Out of scans for today (${LIMITS.scans}). They refill at 00:00 UTC.`);
    await ctx.db.insert("scans", { playerId: player._id, key, layer, n, date, source: "scan" });
    if (!(await profileOf(ctx, key))) await enqueue(ctx, "profile", `profile:${key}`, { layer, n }, 0);
    return { layer, n };
  },
});

// The neurons this player has seen, newest first, with what is known about each.
export const seen = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, { token }) => {
    const player = await playerFor(ctx, token);
    if (!player) return [];
    const rows = await ctx.db.query("scans").withIndex("by_player", (q) => q.eq("playerId", player._id)).order("desc").take(60);
    return await Promise.all(
      rows.map(async (s) => {
        const prof = await profileOf(ctx, s.key);
        const c = await catchOf(ctx, s.key);
        return {
          layer: s.layer,
          n: s.n,
          source: s.source,
          rarity: (prof?.rarity ?? null) as Rarity | null,
          words: prof?.words.slice(0, 4) ?? [],
          caughtBy: c ? (c.playerId === player._id ? "you" : "taken") : null,
        };
      }),
    );
  },
});

export const catchCheck = internalQuery({
  args: { token: v.string(), layer: v.number(), n: v.number() },
  handler: async (ctx, { token, layer, n }) => {
    const player = await requirePlayer(ctx, token);
    const key = neuronKey(layer, n);
    const scanned = await ctx.db.query("scans").withIndex("by_player_key", (q) => q.eq("playerId", player._id).eq("key", key)).first();
    if (!scanned) throw new ConvexError("Scan it before you catch it");
    const prof = await profileOf(ctx, key);
    if (!prof) throw new ConvexError("Still measuring this neuron");
    if (await catchOf(ctx, key)) throw new ConvexError("Someone already caught this one");
    return { embedding: prof.embedding };
  },
});

export const catchCommit = internalMutation({
  args: { token: v.string(), layer: v.number(), n: v.number(), name: v.string(), uniqueness: v.number() },
  handler: async (ctx, { token, layer, n, name, uniqueness }) => {
    const player = await requirePlayer(ctx, token);
    const key = neuronKey(layer, n);
    const date = today();
    const caughtToday = await ctx.db.query("catches").withIndex("by_player_date", (q) => q.eq("playerId", player._id).eq("date", date)).collect();
    if (caughtToday.length >= LIMITS.catches) throw new ConvexError(`Out of catches for today (${LIMITS.catches})`);
    if (await catchOf(ctx, key)) throw new ConvexError("Someone already caught this one");
    const prof = (await profileOf(ctx, key))!;
    const rarity = prof.rarity as Rarity;
    const points = Math.round(POINTS[rarity] * (1 + uniqueness));
    await ctx.db.insert("catches", { playerId: player._id, key, layer, n, name, rarity, points, uniqueness, date });
    await ctx.db.patch(prof._id, { caught: true });
    await ctx.db.patch(player._id, { points: player.points + points, caught: player.caught + 1 });
    await bumpStats(ctx, { caught: { layer, n } });
    return { points, rarity, uniqueness };
  },
});

// Catch a scanned neuron and name it. Points = rarity points x (1 + uniqueness), where uniqueness is how far its effect
// is from every neuron caught before it (1 - the nearest cosine), so the hundredth "ocean" neuron is worth less.
export const catchNeuron = action({
  args: { token: v.string(), layer: v.number(), n: v.number(), name: v.string() },
  handler: async (ctx, args): Promise<{ points: number; rarity: string; uniqueness: number }> => {
    const name = args.name.trim().replace(/\s+/g, " ");
    if (name.length < 2 || name.length > 24) throw new ConvexError("Names are 2-24 characters");
    const { embedding } = await ctx.runQuery(internal.neurons.catchCheck, args);
    const near = await ctx.vectorSearch("profiles", "by_embedding", { vector: embedding, limit: 1, filter: (q) => q.eq("caught", true) });
    const uniqueness = Math.min(1, Math.max(0, 1 - (near[0]?._score ?? 0)));
    return await ctx.runMutation(internal.neurons.catchCommit, { ...args, name, uniqueness: Math.round(uniqueness * 1000) / 1000 });
  },
});

// The dex: every caught neuron, newest first, optionally one rarity.
export const dex = query({
  args: { rarity: v.optional(v.string()), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { rarity, paginationOpts }) => {
    const q = rarity
      ? ctx.db.query("catches").withIndex("by_rarity", (i) => i.eq("rarity", rarity))
      : ctx.db.query("catches");
    const page = await q.order("desc").paginate(paginationOpts);
    const handles = new Map<string, string>();
    return {
      ...page,
      page: await Promise.all(
        page.page.map(async (c) => {
          if (!handles.has(c.playerId)) handles.set(c.playerId, (await ctx.db.get(c.playerId))?.handle ?? "?");
          const prof = await profileOf(ctx, c.key);
          return {
            layer: c.layer,
            n: c.n,
            name: c.name,
            rarity: c.rarity as Rarity,
            points: c.points,
            handle: handles.get(c.playerId)!,
            words: prof?.words.slice(0, 4) ?? [],
            at: c._creationTime,
          };
        }),
      ),
    };
  },
});

export const overview = query({
  args: {},
  handler: async (ctx) => {
    const s = await globalStats(ctx);
    const recent = await ctx.db.query("catches").order("desc").take(12);
    return {
      prompts: s?.prompts ?? [],
      baseline: s?.baseline ?? [],
      total: MODEL.layers * MODEL.width,
      profiled: s?.profiled ?? 0,
      caught: s?.caught ?? 0,
      coverage: s?.coverage ?? [],
      recent: await Promise.all(
        recent.map(async (c) => ({
          layer: c.layer,
          n: c.n,
          name: c.name,
          rarity: c.rarity as Rarity,
          handle: (await ctx.db.get(c.playerId))?.handle ?? "?",
          at: c._creationTime,
        })),
      ),
    };
  },
});
