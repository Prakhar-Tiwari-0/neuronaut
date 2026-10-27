import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { query } from "./_generated/server";
import { COVERAGE_BINS } from "./jobs";
import { MODEL, playerFor, validNeuron } from "./lib";

// Data for the Discovery Map. A block is one coverage-board cell: a run of neighbouring neuron indices in one layer,
// an address range, not a set of similar neurons.
export const NEURONS_PER_BLOCK = MODEL.width / COVERAGE_BINS;
export const MAX_VISITS_PER_PAGE = 128;

// Every neuron the signed-in player has looked at (scanned, or guessed in a daily), in index order. There is one scans
// row per player and neuron, so pages never repeat a neuron. Signed out: an empty, finished list.
export const visits = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const player = await playerFor(ctx);
    if (!player) return { page: [], isDone: true, continueCursor: "" };
    const numItems = Math.min(Math.max(1, Math.floor(paginationOpts.numItems) || 1), MAX_VISITS_PER_PAGE);
    const result = await ctx.db
      .query("scans")
      .withIndex("by_player_ln", (q) => q.eq("playerId", player._id))
      .paginate({ ...paginationOpts, numItems, maximumRowsRead: MAX_VISITS_PER_PAGE });
    return { ...result, page: result.page.map(({ layer, n, source }) => ({ layer, n, source })) };
  },
});

// One block's neurons with what the caller may know about each, under the card's rule: a profile is only disclosed
// (here, only whether one exists) once the caller has visited the neuron or someone has caught it. "unknown" means
// not disclosed; "unavailable" means visible but not measured yet.
export const window = query({
  args: { layer: v.number(), block: v.number() },
  handler: async (ctx, { layer, block }) => {
    validNeuron(layer, 0);
    if (!Number.isInteger(block) || block < 0 || block >= COVERAGE_BINS) throw new ConvexError(`Blocks are integers 0-${COVERAGE_BINS - 1}`);
    const start = block * NEURONS_PER_BLOCK;
    const end = start + NEURONS_PER_BLOCK - 1;
    const player = await playerFor(ctx);
    const [catches, visited, profiles] = await Promise.all([
      ctx.db.query("catches").withIndex("by_ln", (q) => q.eq("layer", layer).gte("n", start).lte("n", end)).collect(),
      player
        ? ctx.db.query("scans").withIndex("by_player_ln", (q) => q.eq("playerId", player._id).eq("layer", layer).gte("n", start).lte("n", end)).collect()
        : [],
      ctx.db.query("profiles").withIndex("by_ln", (q) => q.eq("layer", layer).gte("n", start).lte("n", end)).collect(),
    ]);
    const owner = new Map(catches.map((c) => [c.n, c.playerId]));
    const seen = new Set(visited.map((s) => s.n));
    const measured = new Set(profiles.map((p) => p.n));
    const neurons = Array.from({ length: NEURONS_PER_BLOCK }, (_, i) => {
      const n = start + i;
      const by = owner.get(n);
      const visible = seen.has(n) || by !== undefined;
      return {
        n,
        visited: seen.has(n),
        observation: !visible ? ("unknown" as const) : measured.has(n) ? ("available" as const) : ("unavailable" as const),
        caught: by === undefined ? null : { mine: by === player?._id },
      };
    });
    return { layer, block, start, end, neurons };
  },
});
