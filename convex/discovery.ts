import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { COVERAGE_BINS } from "./jobs";
import { MODEL, neuronKey, playerFor, validNeuron } from "./lib";

// Address partitions, not similarity coordinates. Keep the map aligned with the existing coverage board.
export const BLOCKS_PER_LAYER = COVERAGE_BINS;
export const NEURONS_PER_BLOCK = MODEL.width / BLOCKS_PER_LAYER;
export const MAX_VISITS_PER_PAGE = 128;
const MAX_VISIT_BYTES = 64 * 1024;

// Stable index order: player, neuron key (lexicographic), then creation time. Cursors refer to raw rows, not the
// deduplicated output. A repeated address can cross pages; consumers must union `sources` by (layer, n) across pages.
// `isDone` describes the raw history, so an incomplete history never establishes that a neuron wasn't visited.
// Sources describe stored visits, not every later action: existing gameplay normally stores only the first visit.
export const visits = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    if (!Number.isInteger(paginationOpts.numItems) || paginationOpts.numItems < 1 || paginationOpts.numItems > MAX_VISITS_PER_PAGE)
      throw new ConvexError(`Request 1-${MAX_VISITS_PER_PAGE} visit records per page`);
    const player = await playerFor(ctx);
    if (!player) return { page: [], isDone: true, continueCursor: "" };
    const result = await ctx.db.query("scans")
      .withIndex("by_player_key", q => q.eq("playerId", player._id))
      .order("asc")
      .paginate({ ...paginationOpts, maximumRowsRead: MAX_VISITS_PER_PAGE, maximumBytesRead: MAX_VISIT_BYTES });
    const addresses = new Map<string, { layer: number; n: number; sources: Set<Doc<"scans">["source"]> }>();
    for (const row of result.page) {
      const key = neuronKey(row.layer, row.n);
      let address = addresses.get(key);
      if (!address) {
        address = { layer: row.layer, n: row.n, sources: new Set() };
        addresses.set(key, address);
      }
      address.sources.add(row.source);
    }
    return {
      ...result,
      page: [...addresses.values()].map(({ layer, n, sources }) => ({ layer, n, sources: [...sources].sort() })),
    };
  },
});

// A returned window is fully loaded. Before it arrives the UI must show "unloaded", not infer unexplored neurons.
// `unknown` means the caller cannot inspect measurement readiness, even if a hidden cached profile exists.
export const window = query({
  args: { layer: v.number(), block: v.number() },
  handler: async (ctx, { layer, block }) => {
    validNeuron(layer, 0);
    if (!Number.isInteger(block) || block < 0 || block >= BLOCKS_PER_LAYER)
      throw new ConvexError(`Blocks are integers 0-${BLOCKS_PER_LAYER - 1}`);
    const player = await playerFor(ctx);
    const start = block * NEURONS_PER_BLOCK;
    const neurons = await Promise.all(Array.from({ length: NEURONS_PER_BLOCK }, async (_, offset) => {
      const n = start + offset;
      const key = neuronKey(layer, n);
      const [caught, visit] = await Promise.all([
        ctx.db.query("catches").withIndex("by_key", q => q.eq("key", key)).unique(),
        player ? ctx.db.query("scans").withIndex("by_player_key", q => q.eq("playerId", player._id).eq("key", key)).first() : null,
      ]);
      // Exactly the card's disclosure boundary. Never inspect hidden profiles or query the worker's store/jobs.
      // Missing data for a visible neuron means unavailable, not unmeasured or necessarily pending inference.
      let observation: "unknown" | "available" | "unavailable" = "unknown";
      if (visit || caught) {
        const profile = await ctx.db.query("profiles").withIndex("by_key", q => q.eq("key", key)).first();
        observation = profile ? "available" : "unavailable";
      }
      return { n, visited: !!visit, observation, caught: caught ? { mine: !!player && caught.playerId === player._id } : null };
    }));
    return { layer, block, start, end: start + NEURONS_PER_BLOCK - 1, neurons };
  },
});
